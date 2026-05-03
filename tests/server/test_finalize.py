from __future__ import annotations

from pathlib import Path

import pytest

from server.config import IngestionConfig
from server.docx_io import ParsedDoc, Paragraph, parse_docx, write_docx
from server.finalize import FinalizeError, finalize_chapter
from server.ingest import ingest_book
from server.state import ChapterMeta, ChapterStatus, load_book_meta, save_chapter_meta


@pytest.fixture
def ingested(translate_root: Path, fixtures_dir: Path):
    return ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )


def test_finalize_writes_final_docx_and_marks_done(ingested) -> None:
    # Simulate a completed round 1 by writing round-1-editor.docx + meta.
    cdir = Path(ingested.book_dir) / "chapters" / "ch01"
    cdir.mkdir(parents=True, exist_ok=True)
    parsed = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre Un"),
        Paragraph(style="normal", text="Salut."),
    ])
    write_docx(parsed, cdir / "round-1-editor.docx")
    save_chapter_meta(ingested.slug, ChapterMeta(n=1, status=ChapterStatus.IN_PROGRESS, current_round=1))
    finalize_chapter(slug=ingested.slug, chapter_n=1)
    final = cdir / "final.docx"
    assert final.exists()
    re_parsed = parse_docx(final)
    assert re_parsed.paragraphs[0].text == "Chapitre Un"
    # Book meta updated.
    bm = load_book_meta(ingested.slug)
    assert bm.chapters[0].status == ChapterStatus.DONE


def test_finalize_raises_when_no_round_complete(ingested) -> None:
    with pytest.raises(FinalizeError):
        finalize_chapter(slug=ingested.slug, chapter_n=1)
