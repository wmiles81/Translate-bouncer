"""Book ingestion: detect format, split chapters, pair English with translated, write source folders."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import List

from server.chapter_split import SplitChapter


class SourceFormat(str, Enum):
    FOLDER = "folder"
    SINGLE_DOCX = "single-docx"


class ChapterCountMismatch(Exception):
    def __init__(self, en_count: int, tr_count: int, en_titles: List[str], tr_titles: List[str]):
        self.en_count = en_count
        self.tr_count = tr_count
        self.en_titles = en_titles
        self.tr_titles = tr_titles
        super().__init__(
            f"English: {en_count} chapters | Translated: {tr_count} chapters"
        )


@dataclass
class IngestResult:
    slug: str
    chapters: List[SplitChapter]  # translated chapters; English mirror lives on disk
    book_dir: Path


def detect_format(path: Path | str) -> SourceFormat:
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(p)
    if p.is_dir():
        if not any(child.suffix.lower() == ".docx" for child in p.iterdir()):
            raise ValueError(f"no .docx files in {p}")
        return SourceFormat.FOLDER
    if p.suffix.lower() == ".docx":
        return SourceFormat.SINGLE_DOCX
    raise ValueError(f"unsupported source: {p}")


def ingest_book(*args, **kwargs):
    """Stub — implemented in Phase 9.3."""
    raise NotImplementedError("ingest_book is implemented in Phase 9.3")
