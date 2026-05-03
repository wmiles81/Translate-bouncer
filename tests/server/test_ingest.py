from __future__ import annotations

from pathlib import Path

import pytest

from server.ingest import (
    ChapterCountMismatch,
    IngestResult,
    SourceFormat,
    detect_format,
    ingest_book,
)


def test_detect_format_folder(fixtures_dir: Path) -> None:
    assert detect_format(fixtures_dir / "sample-en-folder") == SourceFormat.FOLDER


def test_detect_format_single_docx(fixtures_dir: Path) -> None:
    assert detect_format(fixtures_dir / "sample-en-whole.docx") == SourceFormat.SINGLE_DOCX


def test_detect_format_empty_folder_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="no .docx"):
        detect_format(tmp_path)


def test_detect_format_unknown_path_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        detect_format(tmp_path / "nope")


from server.ingest import read_chapters
from server.config import IngestionConfig


def test_read_chapters_from_folder_returns_three(fixtures_dir: Path) -> None:
    cfg = IngestionConfig()
    chapters = read_chapters(fixtures_dir / "sample-en-folder", cfg)
    assert len(chapters) == 3
    # Folder ingestion uses the filename (without extension) as the title.
    assert [c.title for c in chapters] == ["ch01", "ch02", "ch03"]


def test_read_chapters_from_single_docx_returns_three(fixtures_dir: Path) -> None:
    cfg = IngestionConfig()
    chapters = read_chapters(fixtures_dir / "sample-en-whole.docx", cfg)
    assert len(chapters) == 3
    assert [c.title for c in chapters] == ["Chapter 1", "Chapter 2", "Chapter 3"]
