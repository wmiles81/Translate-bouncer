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


def parse_target_lines(
    text: str,
    *,
    target_code: str,
    expected_count: int,
) -> ParsedDoc:
    """Extract target-language paragraphs from a model response.

    Discards the source lines (if present), expects one target line per [N] block,
    and reconstructs heading vs normal style from a leading `# ` marker.
    """
    tgt = f"{target_code.upper()}:"
    blocks = _split_blocks(text)
    if len(blocks) != expected_count:
        raise PayloadParseError(
            f"expected {expected_count} blocks, found {len(blocks)}"
        )
    paragraphs: List[Paragraph] = []
    for idx, block in enumerate(blocks, start=1):
        target_line = next(
            (line for line in block.splitlines() if line.lstrip().startswith(tgt)),
            None,
        )
        if target_line is None:
            raise PayloadParseError(f"block {idx}: no `{tgt}` line found")
        body = target_line.lstrip()[len(tgt):].strip()
        style = "normal"
        if body.startswith("# "):
            style = "heading-1"
            body = body[2:]
        paragraphs.append(Paragraph(style=style, text=body))
    return ParsedDoc(paragraphs=paragraphs)


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
