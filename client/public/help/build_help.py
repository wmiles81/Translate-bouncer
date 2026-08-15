#!/usr/bin/env python3
"""build_help.py — compiles a help/ content tree into assets/content.js.

Reads:
    <help-dir>/manifest.json
    <help-dir>/content/**/*.md
    <help-dir>/credits.md            (auto-generated as a stub if missing)

Writes:
    <help-dir>/assets/content.js     (const HELP_CATEGORIES + const HELP_CONFIG)

Why this exists instead of loading markdown at runtime with fetch(): the
generated help page is designed to be opened by double-clicking index.html,
which loads it under the file:// origin. Browsers block fetch() (and XHR)
against file:// for local files as a security measure, so there is no way to
load *.md content at runtime in that scenario. Compiling everything into a
single content.js that's included via a plain <script> tag sidesteps that
restriction entirely and keeps the shell dependency-free.

Standard library only — no pip installs — so this script runs unchanged in a
Python project, a JS-only project, or anything else; nothing needs to be
`pip install`ed for the build to work.

CLI:
    python3 build_help.py [--help-dir help] [--watch] [--check]

    --help-dir DIR   Directory containing manifest.json, content/, credits.md
                      (default: help)
    --check          Validate only; do not write content.js. Exits non-zero
                      if there are any errors.
    --watch          Rebuild automatically whenever a source file's mtime
                      changes. Polls every 500ms. Ctrl+C to stop.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path

# =====================================================================
# Vendored minimal Markdown -> HTML renderer
#
# Deliberately small: it covers exactly the vocabulary assets/vanilla's
# style.css knows how to style — h1-h4 (with auto-generated ids for
# in-page anchor links), paragraphs, bold, italic, inline code, fenced
# code blocks, unordered/ordered lists (nestable by leading indentation),
# links, tables, blockquotes, horizontal rules — plus two custom callout
# extensions (> [!NOTE] / > [!WARNING]). It is not CommonMark-complete on
# purpose: no setext headings, no reference-style links. If a project
# needs more than this, it should author raw HTML for that one spot (see
# the "raw HTML passthrough" rule below) rather than this file growing
# into a full Markdown implementation.
# =====================================================================

_ATX_RE = re.compile(r'^(#{1,4})\s+(.*)$')
_HR_RE = re.compile(r'^\s*([-*_])(?:\s*\1){2,}\s*$')
_UL_RE = re.compile(r'^([ \t]*)[-*+]\s+(.*)$')
_OL_RE = re.compile(r'^([ \t]*)\d+[.)]\s+(.*)$')
# Leading whitespace is allowed so a fence indented inside a list item (see
# _render_list_block) is still recognized as a fence rather than falling
# through to paragraph text. Backtick count is captured (3 or more) so the
# closing fence can be required to match it — see _consume_fence.
_FENCE_RE = re.compile(r'^([ \t]*)(`{3,})(\S*)\s*$')
_TAG_STRIP_RE = re.compile(r'<[^>]+>')
_SLUG_WS_RE = re.compile(r'\s+')
_SLUG_INVALID_RE = re.compile(r'[^a-z0-9-]+')
_SLUG_MULTI_HYPHEN_RE = re.compile(r'-{2,}')

# Double-backtick form first (``code with ` backtick``) so a literal
# backtick can appear inside inline code, per CommonMark; falls back to
# plain single-backtick spans. Alternation is tried left-to-right at each
# position, so ordinary `code` spans are unaffected — the double-backtick
# branch only matches where two backticks actually open the span.
_INLINE_CODE_RE = re.compile(r'``(.+?)``|`([^`]+)`')
_LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
_BOLD_RE = re.compile(r'\*\*([^*]+)\*\*')
_ITALIC_RE = re.compile(r'(?<!\*)\*([^*\n]+)\*(?!\*)')
_PLACEHOLDER_RE = re.compile(r'\x00(\d+)\x00')

_CALLOUT_NOTE_RE = re.compile(r'^\[!NOTE\]\s*(.*)$', re.IGNORECASE)
_CALLOUT_WARN_RE = re.compile(r'^\[!WARNING\]\s*(.*)$', re.IGNORECASE)

_TABLE_CELL_SEP_RE = re.compile(r'^:?-+:?$')


def escape_html(text: str) -> str:
    """Escape the three characters that matter in HTML text content.

    Deliberately does NOT escape quotes — this is for text nodes, not
    attribute values (attribute values, e.g. link hrefs, are escaped
    separately where they're built).
    """
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_inline(text: str) -> str:
    """Apply inline markdown rules: code, links, bold, italic.

    Order matters: inline code and links are extracted into placeholders
    *before* the rest of the text is HTML-escaped, so backtick contents and
    URLs are never mangled by escaping or by the bold/italic passes that run
    afterward. Placeholders are restored last.
    """
    placeholders = []

    def stash(html_fragment: str) -> str:
        placeholders.append(html_fragment)
        return "\x00%d\x00" % (len(placeholders) - 1)

    def code_sub(m: "re.Match[str]") -> str:
        content = m.group(1) if m.group(1) is not None else m.group(2)
        return stash("<code>" + escape_html(content) + "</code>")

    text = _INLINE_CODE_RE.sub(code_sub, text)

    def link_sub(m: "re.Match[str]") -> str:
        label = escape_html(m.group(1))
        url = m.group(2).replace('"', "%22")
        return stash('<a href="%s">%s</a>' % (url, label))

    text = _LINK_RE.sub(link_sub, text)

    text = escape_html(text)
    text = _BOLD_RE.sub(r"<strong>\1</strong>", text)
    text = _ITALIC_RE.sub(r"<em>\1</em>", text)

    text = _PLACEHOLDER_RE.sub(lambda m: placeholders[int(m.group(1))], text)
    return text


def slugify(rendered_text: str) -> str:
    """Turn a heading's rendered (inline-HTML) text into a URL-safe id.

    Steps, in this exact order (see references/CONTRACT.md / the help-system
    spec — other content is authored assuming this precise algorithm):
      1. Strip all HTML tags from the rendered text.
      2. Lowercase it.
      3. Replace every run of whitespace with a single hyphen.
      4. Remove every character that is not a-z, 0-9, or '-'.
      5. Collapse runs of multiple hyphens into one.
      6. Strip leading/trailing hyphens.
      7. If empty after all that, use "section".
    Deduplication (first occurrence bare, then -2, -3, ...) is handled by the
    caller, since it must be tracked per-topic, not here.
    """
    text = _TAG_STRIP_RE.sub("", rendered_text)
    text = text.lower()
    text = _SLUG_WS_RE.sub("-", text)
    text = _SLUG_INVALID_RE.sub("", text)
    text = _SLUG_MULTI_HYPHEN_RE.sub("-", text)
    text = text.strip("-")
    return text or "section"


def _is_table_separator(line: str) -> bool:
    line = line.strip()
    if not line or "-" not in line:
        return False
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    cells = line.split("|")
    if not cells:
        return False
    return all(_TABLE_CELL_SEP_RE.match(c.strip()) for c in cells)


def _split_table_row(line: str):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def _render_cell(text: str) -> str:
    """Render one table cell.

    Mirrors the top-level raw-HTML-passthrough rule (a line beginning with
    '<' is emitted verbatim) at cell granularity: _render_table only ever
    called render_inline() on cells, so a hand-authored cross-link like
    <a data-goto="cat:page"> in a table cell was unconditionally escaped
    regardless of position. Deliberately conservative — a single-line
    verbatim passthrough, not a reimplementation of block parsing for
    cells (table cells are always single source lines here).
    """
    stripped = text.strip()
    if stripped.startswith("<"):
        return stripped
    return render_inline(text)


def _render_table(header_cells, rows) -> str:
    # No <thead>/<tbody> split, matching the reference implementation's
    # hand-authored tables — #detail tr:nth-child(even) stripes rows by
    # position within a single flat list of <tr> siblings, header included.
    parts = ["<table>", "<tr>"]
    parts.extend("<th>%s</th>" % _render_cell(c) for c in header_cells)
    parts.append("</tr>")
    for row in rows:
        cells = row[: len(header_cells)] + [""] * max(0, len(header_cells) - len(row))
        parts.append("<tr>")
        parts.extend("<td>%s</td>" % _render_cell(c) for c in cells)
        parts.append("</tr>")
    parts.append("</table>")
    return "".join(parts)


def _render_blockquote(quote_lines) -> str:
    """Render a `>`-prefixed block.

    Two custom extensions on top of plain blockquotes, matching the
    .callout / .callout.warn CSS in style.css:
        > [!NOTE]    ...    -> <div class="callout">...</div>
        > [!WARNING] ...    -> <div class="callout warn">...</div>
    """
    if quote_lines:
        first = quote_lines[0].strip()
        note_m = _CALLOUT_NOTE_RE.match(first)
        warn_m = _CALLOUT_WARN_RE.match(first)
        if note_m or warn_m:
            is_warn = bool(warn_m)
            match = warn_m or note_m
            remainder = match.group(1).strip()
            body_lines = ([remainder] if remainder else []) + list(quote_lines[1:])
            body_text = " ".join(l.strip() for l in body_lines if l.strip())
            cls = "callout warn" if is_warn else "callout"
            title = "Warning" if is_warn else "Note"
            body_html = (
                '<p style="margin:0">%s</p>' % render_inline(body_text) if body_text else ""
            )
            return '<div class="%s"><div class="callout-title">%s</div>%s</div>' % (
                cls,
                title,
                body_html,
            )
    body_text = " ".join(l.strip() for l in quote_lines if l.strip())
    return "<blockquote><p>%s</p></blockquote>" % render_inline(body_text)


def _list_indent_width(indent: str) -> int:
    """Column width of a list line's leading indentation.

    Spaces count 1 column each; a tab counts as 4 columns (so a bare tab
    reads the same as 4 spaces). Nesting depth itself is NOT computed from
    this number directly (see _render_list_block) — it's a relative stack
    comparison, which is what makes 2-space, 4-space, and tab-indented
    (and mixed) sources all "just work" as one level per indent step,
    rather than requiring one fixed unit size.
    """
    width = 0
    for ch in indent:
        width += 4 if ch == "\t" else 1
    return width


def _consume_fence(lines, i: int, n: int, fence_m: "re.Match[str]"):
    """Consume a fenced code block starting at lines[i], given a match of
    _FENCE_RE against the opening line. Shared by the top-level block loop
    and _render_list_block (list items can contain their own fences).

    The closing fence must carry at least as many backticks as the opening
    fence (standard CommonMark behavior) — otherwise a fence example nested
    inside another fence (e.g. a ``` block shown inside a ```` block) closes
    the outer block early instead of being treated as literal content.

    Returns (html, next_index).
    """
    tick_count = len(fence_m.group(2))
    lang = fence_m.group(3)
    close_re = re.compile(r'^[ \t]*`{%d,}\s*$' % tick_count)
    i += 1
    code_lines = []
    while i < n and not close_re.match(lines[i]):
        code_lines.append(lines[i])
        i += 1
    if i < n:
        i += 1  # consume closing fence
    code_html = escape_html("\n".join(code_lines))
    cls = ' class="language-%s"' % lang if lang else ""
    html = "<pre><code%s>%s</code></pre>" % (cls, code_html)
    return html, i


def _render_list_frame(frame) -> str:
    tag = frame["type"]
    parts = ["<%s>" % tag]
    for it in frame["items"]:
        parts.append("<li>%s%s</li>" % (it["content"], it["children"]))
    parts.append("</%s>" % tag)
    return "".join(parts)


def _render_list_block(lines, start: int, n: int):
    """Render one run of consecutive (possibly nested, possibly mixed
    ul/ol) list lines starting at lines[start].

    Nesting is tracked with a stack of "frames" (one per open indentation
    level), each holding the <ul>/<ol> type detected for that level and the
    <li> items collected so far. A deeper indentation pushes a new frame,
    nested inside the last item of the frame below it; a shallower (or
    equal) indentation pops back to (or reuses) the matching frame. This is
    a relative comparison, not a fixed-width one, which is what makes mixed
    indentation styles (2-space, 4-space, tab) tolerable rather than
    requiring one exact convention throughout a document.

    Returns (html, next_index).
    """
    stack = []  # each: {"width": int, "type": "ul"|"ol", "items": [...]}
    top_level_html = []

    def close_top():
        frame = stack.pop()
        rendered = _render_list_frame(frame)
        if stack:
            stack[-1]["items"][-1]["children"] += rendered
        else:
            top_level_html.append(rendered)

    i = start
    while i < n:
        ul_m = _UL_RE.match(lines[i])
        ol_m = _OL_RE.match(lines[i])
        if ul_m:
            indent_str, content, ltype = ul_m.group(1), ul_m.group(2), "ul"
        elif ol_m:
            indent_str, content, ltype = ol_m.group(1), ol_m.group(2), "ol"
        else:
            # Not a list-marker line. Two cases belong to the currently
            # open item (the top of the stack) rather than ending the list:
            #
            #   1. An indented fenced code block (e.g. a ```bash example
            #      inside a numbered step) — rendered as a <pre> attached
            #      to that item, not as a sibling block that truncates the
            #      list.
            #   2. A plain indented, non-blank continuation line (a
            #      soft-wrapped sentence continuing the item's text) — the
            #      list-marker regex alone can't recognize this, so without
            #      this branch it would silently end the list and start a
            #      stray paragraph.
            #
            # A blank line, or an unindented line, still ends the list —
            # only indented content is attached.
            raw = lines[i]
            stripped = raw.strip()
            if stack and stripped != "" and raw[:1] in (" ", "\t"):
                fence_m = _FENCE_RE.match(raw)
                if fence_m:
                    html, i = _consume_fence(lines, i, n, fence_m)
                    stack[-1]["items"][-1]["children"] += html
                    continue
                stack[-1]["items"][-1]["content"] += " " + render_inline(stripped)
                i += 1
                continue
            break

        width = _list_indent_width(indent_str)

        # Dedent: close any frames deeper than this line's indentation.
        while stack and width < stack[-1]["width"]:
            close_top()

        # Same indentation but the marker type changed (e.g. "-" then "1.")
        # -> treat as a new list at that level rather than continuing the
        # old one.
        if stack and width == stack[-1]["width"] and stack[-1]["type"] != ltype:
            close_top()

        # Indent (or first line, or after closing a type-mismatched frame
        # at this width): open a new nested frame.
        if not stack or width > stack[-1]["width"]:
            stack.append({"width": width, "type": ltype, "items": []})

        stack[-1]["items"].append(
            {"content": render_inline(content.strip()), "children": ""}
        )
        i += 1

    while stack:
        close_top()

    return "".join(top_level_html), i


def render_markdown(source: str) -> str:
    lines = source.split("\n")
    out = []
    i = 0
    n = len(lines)
    # Heading-id dedup state. A plain local (re-created on every call) is
    # exactly what "reset per topic, not per build" requires, since this
    # function is invoked exactly once per topic/page (see run_build below).
    slug_counts = {}

    while i < n:
        line = lines[i]

        if line.strip() == "":
            i += 1
            continue

        fence_m = _FENCE_RE.match(line)
        if fence_m:
            html, i = _consume_fence(lines, i, n, fence_m)
            out.append(html)
            continue

        atx_m = _ATX_RE.match(line)
        if atx_m:
            level = len(atx_m.group(1))
            text = render_inline(atx_m.group(2).strip())
            base_slug = slugify(text)
            seen = slug_counts.get(base_slug, 0)
            if seen:
                slug_counts[base_slug] = seen + 1
                heading_id = "%s-%d" % (base_slug, seen + 1)
            else:
                slug_counts[base_slug] = 1
                heading_id = base_slug
            out.append('<h%d id="%s">%s</h%d>' % (level, heading_id, text, level))
            i += 1
            continue

        if _HR_RE.match(line):
            out.append('<hr class="sep">')
            i += 1
            continue

        if line.lstrip().startswith(">"):
            quote_lines = []
            while i < n and lines[i].lstrip().startswith(">"):
                stripped = lines[i].lstrip()[1:]
                if stripped.startswith(" "):
                    stripped = stripped[1:]
                quote_lines.append(stripped)
                i += 1
            out.append(_render_blockquote(quote_lines))
            continue

        # Raw HTML passthrough: a line beginning with '<' (after leading
        # whitespace) is emitted verbatim, unescaped, so authors can drop in
        # markup style.css already understands (e.g. <span class=
        # "badge-command">, <div class="host-grid"> layouts, or a hand-authored
        # <a data-goto="cat:page"> cross-link) without fighting the renderer.
        # Consecutive such lines are kept together as one block.
        if line.lstrip().startswith("<"):
            html_lines = []
            while i < n and lines[i].strip() != "" and lines[i].lstrip().startswith("<"):
                html_lines.append(lines[i])
                i += 1
            out.append("\n".join(html_lines))
            continue

        if i + 1 < n and "|" in line and _is_table_separator(lines[i + 1]):
            header_cells = _split_table_row(line)
            i += 2
            rows = []
            while i < n and lines[i].strip() != "" and "|" in lines[i]:
                rows.append(_split_table_row(lines[i]))
                i += 1
            out.append(_render_table(header_cells, rows))
            continue

        if _UL_RE.match(line) or _OL_RE.match(line):
            list_html, i = _render_list_block(lines, i, n)
            out.append(list_html)
            continue

        # Paragraph: gather consecutive plain lines until a blank line or the
        # start of another block type, then join with spaces (soft-wrap
        # source lines collapse into one flowing paragraph, as in CommonMark).
        para_lines = []
        while i < n and lines[i].strip() != "":
            l = lines[i]
            if (
                _ATX_RE.match(l)
                or _HR_RE.match(l)
                or l.lstrip().startswith(">")
                or l.lstrip().startswith("<")
                or _FENCE_RE.match(l)
                or _UL_RE.match(l)
                or _OL_RE.match(l)
            ):
                break
            if i + 1 < n and "|" in l and _is_table_separator(lines[i + 1]):
                break
            para_lines.append(l.strip())
            i += 1
        if para_lines:
            out.append("<p>" + render_inline(" ".join(para_lines)) + "</p>")
        else:
            i += 1  # safety valve against an unreachable infinite loop

    return "\n".join(out)


# =====================================================================
# Front matter (title override only — not full YAML)
# =====================================================================

_FRONTMATTER_KV_RE = re.compile(r'^([A-Za-z0-9_-]+)\s*:\s*(.*)$')


def parse_front_matter(source: str):
    """Parse an optional leading `---` block of simple `key: value` lines.

    Only plain scalars are supported (optionally quoted). No lists, no
    nesting, no YAML types — this is intentionally not a YAML parser, just
    enough to let a topic file override its manifest-declared title.
    """
    lines = source.split("\n")
    if not lines or lines[0].strip() != "---":
        return {}, source
    meta = {}
    i = 1
    while i < len(lines) and lines[i].strip() != "---":
        m = _FRONTMATTER_KV_RE.match(lines[i].strip())
        if m:
            key = m.group(1).strip()
            value = m.group(2).strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            meta[key] = value
        i += 1
    if i < len(lines):
        i += 1  # consume closing ---
    body = "\n".join(lines[i:])
    return meta, body


# =====================================================================
# Credits stub generation
#
# help/credits.md is required. If it's missing, we generate a starter file
# on disk (so it persists and the user can edit it) rather than failing the
# build. The stub is populated by best-effort, stdlib-only scanning of
# common dependency/infra manifests so a project doesn't ship a completely
# empty credits page — but it always leaves a TODO for the one thing that
# can't be auto-detected: crediting the original human creators.
# =====================================================================


def _read_text(path: Path):
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return None


def _detect_built_with(root: Path):
    found = []

    pkg = _read_text(root / "package.json")
    if pkg is not None:
        try:
            data = json.loads(pkg)
        except json.JSONDecodeError:
            data = {}
        names = set()
        for section in ("dependencies", "devDependencies"):
            names.update((data.get(section) or {}).keys())
        found.extend(("npm", name) for name in sorted(names))

    req = _read_text(root / "requirements.txt")
    if req is not None:
        for line in req.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            name = re.split(r"[<>=!~\[; ]", line, maxsplit=1)[0].strip()
            if name:
                found.append(("pip", name))

    pyproject = _read_text(root / "pyproject.toml")
    if pyproject is not None:
        # No TOML parser assumed (tomllib is 3.11+ only) — best-effort regex
        # scan for `name = "..."` lines and quoted PEP 621 dependency array
        # entries, not a full parse.
        for m in re.finditer(r'^\s*([A-Za-z0-9_.\-]+)\s*=\s*["\^~]', pyproject, re.MULTILINE):
            found.append(("pip", m.group(1)))
        for m in re.finditer(
            r'^\s*"([A-Za-z0-9_.\-]+)(?:\[[^\]]*\])?\s*(?:[<>=!~][^"]*)?"\s*,?\s*$',
            pyproject,
            re.MULTILINE,
        ):
            found.append(("pip", m.group(1)))

    cargo = _read_text(root / "Cargo.toml")
    if cargo is not None:
        in_deps = False
        for line in cargo.splitlines():
            s = line.strip()
            if s.startswith("["):
                in_deps = s.startswith("[dependencies") or s.startswith("[dev-dependencies")
                continue
            if in_deps:
                m = re.match(r"^([A-Za-z0-9_\-]+)\s*=", s)
                if m:
                    found.append(("cargo", m.group(1)))

    gomod = _read_text(root / "go.mod")
    if gomod is not None:
        for line in gomod.splitlines():
            s = line.strip()
            if s.startswith(("module", "go ", "//")):
                continue
            m = re.match(r"^([\w./\-]+)\s+v[\d.]", s)
            if m:
                found.append(("go", m.group(1)))

    composer = _read_text(root / "composer.json")
    if composer is not None:
        try:
            data = json.loads(composer)
        except json.JSONDecodeError:
            data = {}
        names = set()
        for section in ("require", "require-dev"):
            names.update((data.get(section) or {}).keys())
        found.extend(("composer", name) for name in sorted(names) if name != "php")

    return found


def _detect_infrastructure(root: Path):
    found = []

    dockerfile = _read_text(root / "Dockerfile")
    if dockerfile is not None:
        for m in re.finditer(r"^\s*FROM\s+(\S+)", dockerfile, re.MULTILINE | re.IGNORECASE):
            found.append(("Docker base image", m.group(1)))

    compose = _read_text(root / "docker-compose.yml")
    if compose is None:
        compose = _read_text(root / "docker-compose.yaml")
    if compose is not None:
        for m in re.finditer(r'^\s*image:\s*["\']?([^\s"\']+)', compose, re.MULTILINE):
            found.append(("docker-compose service image", m.group(1)))

    return found


def generate_credits_stub(project_root: Path) -> str:
    built_with = _detect_built_with(project_root)
    infra = _detect_infrastructure(project_root)

    lines = [
        "# Credits & Acknowledgements",
        "",
        "<!-- Auto-generated by build_help.py because credits.md was missing. -->",
        "<!-- This file will NOT be regenerated once it exists — edit it freely. -->",
        "",
        "> [!NOTE]",
        "> This page credits the people and infrastructure this project is built",
        "> on. Please keep it accurate as dependencies change.",
        "",
        "## Original Creators",
        "",
        "**TODO:** credit the original author(s) and/or maintainers of this",
        "project by name, with a link to their site, repository, or profile.",
        "Reused tooling and forked codebases should always carry forward credit",
        "to whoever built the thing this project stands on.",
        "",
        "## Built With",
        "",
    ]
    if built_with:
        for ecosystem, name in built_with:
            lines.append("- `%s` (%s)" % (name, ecosystem))
    else:
        lines.append(
            "No dependency manifest (package.json, requirements.txt, "
            "pyproject.toml, Cargo.toml, go.mod, composer.json) was found "
            "to auto-detect from."
        )
    lines += ["", "## Infrastructure", ""]
    if infra:
        for kind, name in infra:
            lines.append("- `%s` — %s" % (name, kind))
    else:
        lines.append(
            "No Dockerfile or docker-compose.yml was found to auto-detect "
            "from. If this project depends on hosted infrastructure (AWS, "
            "MySQL, PostgreSQL, Cloudflare, etc.), list it here manually."
        )
    lines += [
        "",
        '<hr class="sep">',
        "",
        "This page was generated automatically by build_help.py. It will "
        "only regenerate if this file is deleted.",
        "",
    ]
    return "\n".join(lines)


# =====================================================================
# Manifest loading, validation, and content.js emission
# =====================================================================

RESERVED_CATEGORY_ID = "about"

# Cross-link discovery for validation. This intentionally does NOT reuse a
# bare `data-goto="([^"]+)"` scan over the fully rendered HTML, because that
# matches the substring anywhere in the text — including inside a fenced or
# inline <code> example that is illustrating the syntax, not using it. Two
# things are required together:
#
#   1. Code regions are stripped first. <pre>...</pre> (fenced blocks) and
#      <code>...</code> (inline code) are exactly where syntax examples
#      live, so removing them before scanning is what lets a topic document
#      the data-goto syntax at all.
#   2. What remains must match inside a genuine, unescaped <a ...> tag. This
#      is stricter than just "contains data-goto=" — escape_html() does not
#      escape quote characters, so a literal `<a href="#" data-goto="x">`
#      typed as plain text (e.g. inside a callout, or in a table cell before
#      the Defect 3 fix) still renders as `&lt;a href="#" data-goto="x"&gt;`
#      and would still match a bare data-goto scan. Requiring the literal,
#      unescaped `<a` prefix means an escaped `&lt;a ...` never matches,
#      which is exactly what's needed to document the escaping behavior
#      itself (see maintenance/troubleshooting.md's "Cross-links render as
#      literal HTML" topic) without the validator treating it as a live link.
_CODE_REGION_RE = re.compile(r'<pre\b[^>]*>.*?</pre>|<code\b[^>]*>.*?</code>', re.DOTALL)
_DATA_GOTO_LINK_RE = re.compile(r'<a\s[^>]*data-goto="([^"]+)"')


def find_data_goto_targets(html: str):
    """Return every data-goto target from a genuine <a> tag in `html`,
    ignoring anything inside a code region or written as escaped/plain text.
    """
    stripped = _CODE_REGION_RE.sub("", html)
    return [m.group(1) for m in _DATA_GOTO_LINK_RE.finditer(stripped)]


class Issue:
    __slots__ = ("level", "message")

    def __init__(self, level: str, message: str):
        self.level = level
        self.message = message


def _write_text_lf(path: Path, text: str) -> None:
    # Explicit newline='\n' so output bytes are identical across platforms —
    # Python's default text-mode write would translate '\n' to '\r\n' on
    # Windows, which would make "same inputs -> byte-identical output" false.
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def run_build(help_dir: Path, check: bool) -> int:
    issues = []

    def error(msg: str) -> None:
        issues.append(Issue("error", msg))

    def warn(msg: str) -> None:
        issues.append(Issue("warning", msg))

    manifest_path = help_dir / "manifest.json"
    if not manifest_path.is_file():
        print("ERROR: manifest not found at %s" % manifest_path)
        return 1

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print("ERROR: could not parse %s: %s" % (manifest_path, e))
        return 1

    title = manifest.get("title") or "Help"
    storage_key = manifest.get("storageKey") or "help"
    default_topic = manifest.get("defaultTopic")
    default_expanded = manifest.get("defaultExpanded") or []
    features = manifest.get("features") or {}
    context_map = manifest.get("contextMap") or {}
    raw_categories = manifest.get("categories")

    if not isinstance(raw_categories, list) or not raw_categories:
        error("manifest.categories must be a non-empty array")
        raw_categories = []

    content_root = help_dir / "content"

    seen_cat_ids = set()
    seen_keys = set()
    referenced_files = set()
    categories_out = []
    data_goto_targets = []  # (key_where_found, target)

    for cat in raw_categories:
        cat_id = cat.get("id")
        if not cat_id:
            error("a category is missing 'id'")
            continue
        if cat_id in seen_cat_ids:
            error("duplicate category id '%s'" % cat_id)
            continue
        if cat_id == RESERVED_CATEGORY_ID:
            error(
                "category id '%s' is reserved for the auto-appended credits "
                "category — rename it in manifest.json" % RESERVED_CATEGORY_ID
            )
            continue
        seen_cat_ids.add(cat_id)

        label = cat.get("label") or cat_id
        icon = cat.get("icon") or "\U0001F4C4"  # generic page icon fallback
        pages = cat.get("pages")
        if not isinstance(pages, list) or not pages:
            error("category '%s' has no pages" % cat_id)
            pages = []

        pages_out = []
        for page in pages:
            page_id = page.get("id")
            file_rel = page.get("file")
            if not page_id or not file_rel:
                error("a page in category '%s' is missing 'id' or 'file'" % cat_id)
                continue
            key = cat_id + ":" + page_id
            if key in seen_keys:
                error("duplicate topic key '%s'" % key)
                continue
            seen_keys.add(key)

            file_path = content_root / file_rel
            if not file_path.is_file():
                error("manifest entry '%s' references missing file: %s" % (key, file_path))
                continue
            referenced_files.add(file_path.resolve())

            source = file_path.read_text(encoding="utf-8")
            meta, body = parse_front_matter(source)
            # Front-matter title (if present) overrides the manifest's title.
            page_title = meta.get("title") or page.get("title") or page_id
            page_html = render_markdown(body)

            for target in find_data_goto_targets(page_html):
                data_goto_targets.append((key, target))

            pages_out.append(
                {"id": page_id, "title": escape_html(page_title), "html": page_html}
            )

        categories_out.append(
            {"id": cat_id, "label": label, "icon": icon, "pages": pages_out}
        )

    # ---- Orphan detection ----
    if content_root.is_dir():
        for md_file in sorted(content_root.rglob("*.md")):
            if md_file.resolve() not in referenced_files:
                warn(
                    "orphan markdown file (not referenced by any manifest "
                    "page): %s" % md_file.relative_to(help_dir)
                )

    # ---- Credits (always appended last) ----
    credits_path = help_dir / "credits.md"
    if credits_path.is_file():
        credits_source = credits_path.read_text(encoding="utf-8")
    else:
        project_root = help_dir.resolve().parent
        credits_source = generate_credits_stub(project_root)
        if check:
            print(
                "NOTICE: %s is missing — a starter credits file would be "
                "generated on a real build." % credits_path
            )
        else:
            _write_text_lf(credits_path, credits_source)
            print(
                "NOTICE: %s was missing — generated a starter credits file. "
                "Edit it to add real attribution." % credits_path
            )

    credits_meta, credits_body = parse_front_matter(credits_source)
    credits_title = credits_meta.get("title") or "Credits & Acknowledgements"
    credits_html = render_markdown(credits_body)
    for target in find_data_goto_targets(credits_html):
        data_goto_targets.append(("about:credits", target))

    categories_out.append(
        {
            "id": RESERVED_CATEGORY_ID,
            "label": "About & Credits",
            "icon": "ℹ️",  # ℹ️
            "pages": [
                {
                    "id": "credits",
                    "title": escape_html(credits_title),
                    "html": credits_html,
                }
            ],
        }
    )
    seen_keys.add("about:credits")

    # ---- Cross-link validation ----
    for source_key, target in data_goto_targets:
        if target not in seen_keys:
            error("'%s' contains a data-goto link to unknown topic '%s'" % (source_key, target))

    # ---- defaultTopic ----
    if default_topic is not None and default_topic not in seen_keys:
        error("manifest.defaultTopic '%s' does not resolve to any topic" % default_topic)

    # ---- contextMap (soft validation — unknown ctx already falls back
    #      gracefully at runtime, so this is a warning, not an error) ----
    if isinstance(context_map, dict):
        for ctx_id, target in context_map.items():
            if target not in seen_keys:
                warn(
                    "manifest.contextMap['%s'] points to unknown topic '%s'"
                    % (ctx_id, target)
                )

    # ---- Report ----
    errors = [it for it in issues if it.level == "error"]
    warnings = [it for it in issues if it.level == "warning"]
    for it in issues:
        print("%s: %s" % ("ERROR" if it.level == "error" else "WARNING", it.message))

    n_categories = len(categories_out)
    n_topics = sum(len(c["pages"]) for c in categories_out)
    output_path = help_dir / "assets" / "content.js"

    if errors:
        print("\nBuild failed: %d error(s), %d warning(s)." % (len(errors), len(warnings)))
        return 1

    if check:
        print(
            "\nCheck passed: %d categories, %d topics, %d warning(s). "
            "Nothing written (--check)." % (n_categories, n_topics, len(warnings))
        )
        return 0

    config_out = {
        "title": title,
        "storageKey": storage_key,
        "defaultTopic": default_topic,
        "defaultExpanded": default_expanded,
        "features": features,
        "contextMap": context_map,
    }

    # Line comments, not a /* */ block: help_dir paths or filenames could
    # legitimately contain "*/" as a substring (e.g. a glob-like path), which
    # would silently terminate a block comment early and corrupt the file.
    header = (
        "// AUTO-GENERATED by build_help.py — DO NOT EDIT BY HAND.\n"
        "// Regenerate with: python3 build_help.py --help-dir %s\n"
        "// Source: %s/manifest.json + %s/content/ (markdown) + %s/credits.md\n\n"
    ) % (help_dir.as_posix(), help_dir.as_posix(), help_dir.as_posix(), help_dir.as_posix())

    content_js = (
        header
        + "const HELP_CATEGORIES = "
        + json.dumps(categories_out, indent=2, ensure_ascii=False)
        + ";\n\nconst HELP_CONFIG = "
        + json.dumps(config_out, indent=2, ensure_ascii=False)
        + ";\n"
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    _write_text_lf(output_path, content_js)

    print(
        "\nBuilt %d categories, %d topics -> %s (%d warning(s))"
        % (n_categories, n_topics, output_path, len(warnings))
    )
    return 0


def _latest_mtime(help_dir: Path):
    paths = [help_dir / "manifest.json", help_dir / "credits.md"]
    content_root = help_dir / "content"
    if content_root.is_dir():
        paths.extend(content_root.rglob("*.md"))
    mtimes = [p.stat().st_mtime for p in paths if p.exists()]
    return max(mtimes) if mtimes else None


def _watch_loop(help_dir: Path) -> int:
    print("Watching %s for changes (Ctrl+C to stop)..." % help_dir)
    last_mtime = _latest_mtime(help_dir)
    try:
        while True:
            time.sleep(0.5)
            mtime = _latest_mtime(help_dir)
            if mtime != last_mtime:
                last_mtime = mtime
                print("\n[%s] Change detected, rebuilding..." % time.strftime("%H:%M:%S"))
                run_build(help_dir, check=False)
    except KeyboardInterrupt:
        print("\nStopped watching.")
        return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Build help/assets/content.js from manifest.json + content/**/*.md."
    )
    parser.add_argument(
        "--help-dir",
        default="help",
        help="Directory containing manifest.json, content/, and credits.md (default: help)",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Poll for source changes every 500ms and rebuild automatically",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate without writing content.js; exit non-zero on problems",
    )
    args = parser.parse_args(argv)
    help_dir = Path(args.help_dir)

    if args.watch:
        code = run_build(help_dir, check=False)
        if code != 0:
            return code
        return _watch_loop(help_dir)

    return run_build(help_dir, check=args.check)


if __name__ == "__main__":
    sys.exit(main())
