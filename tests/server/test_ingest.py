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


def test_ingest_book_writes_source_folders_and_meta(fixtures_dir: Path, translate_root: Path) -> None:
    result = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )
    assert result.slug == "sample-fr-folder"
    book_dir = translate_root / result.slug
    assert (book_dir / "source-en" / "ch01.docx").exists()
    assert (book_dir / "source-en" / "ch01.json").exists()
    assert (book_dir / "source-translated" / "ch01.docx").exists()
    assert (book_dir / "source-translated" / "ch01.json").exists()
    # Three chapters total.
    assert len(list((book_dir / "source-en").glob("ch*.docx"))) == 3
    assert len(list((book_dir / "source-translated").glob("ch*.docx"))) == 3


def test_ingest_book_raises_on_chapter_count_mismatch(
    fixtures_dir: Path, translate_root: Path, tmp_path: Path
) -> None:
    # Build an EN folder with only 2 chapters.
    short = tmp_path / "short-en"
    short.mkdir()
    for f in sorted((fixtures_dir / "sample-en-folder").iterdir())[:2]:
        (short / f.name).write_bytes(f.read_bytes())
    with pytest.raises(ChapterCountMismatch) as exc:
        ingest_book(
            translated_path=fixtures_dir / "sample-fr-folder",
            english_path=short,
            language_pair=("en", "fr"),
            ingestion=IngestionConfig(),
        )
    assert exc.value.en_count == 2
    assert exc.value.tr_count == 3


def test_ingest_book_uses_existing_slug_with_suffix_on_collision(
    fixtures_dir: Path, translate_root: Path
) -> None:
    first = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )
    second = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
        on_collision="new-session",
    )
    assert second.slug == first.slug + "-2"
    assert (translate_root / second.slug).exists()
