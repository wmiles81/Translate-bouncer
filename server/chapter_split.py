"""Split a whole-book ParsedDoc into a list of per-chapter ParsedDocs.

Strategy (matches spec §6 Settings > Ingestion):
1. Try the configured heading style. If it yields >= 2 chapters, use it.
2. Otherwise, try each fallback regex against the first line of each paragraph.
   The first pattern yielding >= 2 chapters wins.
3. If neither works, raise ChapterSplitError.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import List

from server.docx_io import ParsedDoc, Paragraph, parse_docx


class ChapterSplitError(Exception):
    pass


@dataclass
class SplitChapter:
    title: str
    doc: ParsedDoc


def split_by_heading_style(parsed: ParsedDoc, *, heading_style: str = "heading-1") -> List[SplitChapter]:
    """Split on paragraphs whose style equals `heading_style`."""
    target = heading_style.lower()
    chapters: List[SplitChapter] = []
    current: List[Paragraph] | None = None
    title = ""
    for p in parsed.paragraphs:
        if p.style == target:
            if current is not None:
                chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
            title = p.text
            current = [p]
        else:
            if current is None:
                continue  # skip preamble before the first heading
            current.append(p)
    if current is not None:
        chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
    return chapters


def split_by_pattern(parsed: ParsedDoc, *, patterns: List[str]) -> List[SplitChapter]:
    """Split on paragraphs whose text matches any of the regex patterns."""
    compiled = [re.compile(pat) for pat in patterns]
    chapters: List[SplitChapter] = []
    current: List[Paragraph] | None = None
    title = ""
    for p in parsed.paragraphs:
        if any(c.match(p.text.strip()) for c in compiled):
            if current is not None:
                chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
            title = p.text
            current = [p]
        else:
            if current is None:
                continue
            current.append(p)
    if current is not None:
        chapters.append(SplitChapter(title=title, doc=ParsedDoc(paragraphs=current)))
    return chapters


def split_docx(
    path: Path | str,
    *,
    heading_style: str,
    fallback_patterns: List[str],
) -> List[SplitChapter]:
    parsed = parse_docx(path)
    by_heading = split_by_heading_style(parsed, heading_style=heading_style.lower().replace(" ", "-"))
    if len(by_heading) >= 2:
        return by_heading
    for pat in fallback_patterns:
        result = split_by_pattern(parsed, patterns=[pat])
        if len(result) >= 2:
            return result
    raise ChapterSplitError(
        f"Could not split {path!r}: heading style yielded {len(by_heading)} chapters, "
        "no fallback pattern matched."
    )
