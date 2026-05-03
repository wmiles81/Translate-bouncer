"""Bilingual paragraph-aligned payload format used to talk to LLMs.

Wire format:
    [1]
    EN: <english paragraph 1, with optional `# ` heading prefix>
    FR: <french paragraph 1>

    [2]
    ...

Headings are prefixed with `# ` on the line. Italic/bold inline markers (`*x*`,
`**x**`) are passed through verbatim.
"""
from __future__ import annotations

import re
from typing import List

from server.docx_io import ParsedDoc, Paragraph


class PayloadParseError(Exception):
    pass


def _prefix(p: Paragraph) -> str:
    return "# " if p.style.startswith("heading-") else ""


def render_payload(
    en: ParsedDoc,
    target: ParsedDoc,
    *,
    source_code: str,
    target_code: str,
) -> str:
    if len(en.paragraphs) != len(target.paragraphs):
        raise ValueError(
            f"paragraph count mismatch: source={len(en.paragraphs)}, target={len(target.paragraphs)}"
        )
    src = source_code.upper()
    tgt = target_code.upper()
    out: list[str] = []
    for i, (e, t) in enumerate(zip(en.paragraphs, target.paragraphs), start=1):
        out.append(f"[{i}]")
        out.append(f"{src}: {_prefix(e)}{e.text}")
        out.append(f"{tgt}: {_prefix(t)}{t.text}")
        out.append("")
    return "\n".join(out)


_BLOCK_RE = re.compile(r"\[(\d+)\]")


def _line_to_paragraph(body: str) -> Paragraph:
    """Convert a target-language line body (with optional `# ` heading prefix) into a Paragraph."""
    style = "normal"
    if body.startswith("# "):
        style = "heading-1"
        body = body[2:]
    return Paragraph(style=style, text=body)


def parse_target_lines(
    text: str,
    *,
    target_code: str,
    expected_count: int,
) -> ParsedDoc:
    """Extract target-language paragraphs from a model response.

    Tries two strategies in order:
      1. Strict `[N]` blocks (the format we asked for).
      2. Fallback: count raw `<TGT>:` prefixed lines anywhere in the response.

    The fallback handles models that drop the `[N]` markers but otherwise
    return one target line per source paragraph.
    """
    tgt = f"{target_code.upper()}:"

    # Strategy 1: parse [N] blocks.
    blocks = _split_blocks(text)
    if len(blocks) == expected_count:
        paragraphs: List[Paragraph] = []
        for idx, block in enumerate(blocks, start=1):
            target_line = next(
                (line for line in block.splitlines() if line.lstrip().startswith(tgt)),
                None,
            )
            if target_line is None:
                raise PayloadParseError(f"block {idx}: no `{tgt}` line found")
            body = target_line.lstrip()[len(tgt):].strip()
            paragraphs.append(_line_to_paragraph(body))
        return ParsedDoc(paragraphs=paragraphs)

    # Strategy 2: just collect every line that starts with the target prefix.
    direct: List[Paragraph] = []
    for line in text.splitlines():
        stripped = line.lstrip()
        if stripped.startswith(tgt):
            body = stripped[len(tgt):].strip()
            direct.append(_line_to_paragraph(body))
    if len(direct) == expected_count:
        return ParsedDoc(paragraphs=direct)

    raise PayloadParseError(
        f"expected {expected_count} blocks, found {len(blocks)} "
        f"(direct `{tgt}` lines: {len(direct)})"
    )


def _split_blocks(text: str) -> List[str]:
    """Split a payload-style response into per-`[N]` blocks (ignoring header prefix text)."""
    parts = _BLOCK_RE.split(text)
    # Pattern split returns: [pre, "1", block1_text, "2", block2_text, ...]
    if len(parts) < 3:
        return []
    blocks: List[str] = []
    # parts[0] is anything before the first [N]; ignore.
    # parts[1::2] are the indices, parts[2::2] are the block bodies.
    for body in parts[2::2]:
        blocks.append(body.strip())
    return blocks
