from __future__ import annotations

from pathlib import Path

import pytest

from server.config import IngestionConfig
from server.ingest import ingest_book
from server.state import (
    BookMeta,
    ChapterMeta,
    ChapterStatus,
    list_books,
    load_book_meta,
    load_chapter_meta,
    save_chapter_meta,
)


@pytest.fixture
def ingested(translate_root: Path, fixtures_dir: Path):
    return ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )


def test_load_book_meta_returns_typed(ingested) -> None:
    meta = load_book_meta(ingested.slug)
    assert isinstance(meta, BookMeta)
    assert meta.slug == ingested.slug
    assert meta.language_pair.from_ == "en"
    assert meta.language_pair.to == "fr"
    assert len(meta.chapters) == 3
    assert all(c.status == ChapterStatus.UNTOUCHED for c in meta.chapters)


def test_load_chapter_meta_returns_default_when_missing(ingested) -> None:
    cm = load_chapter_meta(ingested.slug, n=1)
    assert isinstance(cm, ChapterMeta)
    assert cm.n == 1
    assert cm.status == ChapterStatus.UNTOUCHED
    assert cm.current_round == 0
    assert cm.rounds == []


def test_save_chapter_meta_persists(ingested) -> None:
    cm = ChapterMeta(n=2, status=ChapterStatus.IN_PROGRESS, current_round=1)
    cm.models.editor = "anthropic/claude-sonnet-4"
    save_chapter_meta(ingested.slug, cm)
    loaded = load_chapter_meta(ingested.slug, n=2)
    assert loaded.status == ChapterStatus.IN_PROGRESS
    assert loaded.current_round == 1
    assert loaded.models.editor == "anthropic/claude-sonnet-4"


def test_list_books_returns_only_book_dirs(ingested, translate_root: Path) -> None:
    # ingested is one book; the prompts/ and config.json should not be returned.
    from server.config import save_config, Config
    save_config(Config())
    from server.prompts import load_prompts, PromptKind
    load_prompts(PromptKind.EDITOR)  # creates prompts dir
    slugs = list_books()
    assert ingested.slug in slugs
    assert "prompts" not in slugs
    assert "config.json" not in slugs
