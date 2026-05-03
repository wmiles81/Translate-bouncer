from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from server.config import IngestionConfig
from server.docx_io import ParsedDoc, Paragraph
from server.errors import RecoverableError
from server.ingest import ingest_book
from server.rounds import (
    LANGUAGE_NAMES,
    render_editor_prompt,
    render_reviewer_prompt,
    run_editor_pass,
)


@pytest.fixture
def ingested(translate_root: Path, fixtures_dir: Path):
    return ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=IngestionConfig(),
    )


def test_render_editor_prompt_substitutes_target_language():
    rendered = render_editor_prompt(
        template="Translate to {TARGET_LANG_NAME}; return {TARGET_LANG_CODE}: lines.",
        target_code="fr",
    )
    assert rendered == "Translate to French; return FR: lines."


def test_render_reviewer_prompt_substitutes_target_language():
    rendered = render_reviewer_prompt(
        template="reviewing {TARGET_LANG_NAME}",
        target_code="es",
    )
    assert rendered == "reviewing Spanish"


async def test_run_editor_pass_writes_round_files(ingested) -> None:
    en = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapter 1"),
        Paragraph(style="normal", text="Hello."),
    ])
    tr = ParsedDoc(paragraphs=[
        Paragraph(style="heading-1", text="Chapitre 1"),
        Paragraph(style="normal", text="Bonjour."),
    ])

    fake_response = "[1]\nFR: # Chapitre Un\n\n[2]\nFR: Salut.\n"
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=fake_response)

    result = await run_editor_pass(
        client=fake_client,
        slug=ingested.slug,
        chapter_n=1,
        round_n=1,
        en_doc=en,
        target_doc=tr,
        source_code="en",
        target_code="fr",
        editor_prompt_template="be brief, target {TARGET_LANG_NAME}",
        prior_reviewer_suggestions=None,
        model="anthropic/claude-sonnet-4",
    )
    assert result.paragraphs[0].style == "heading-1"
    assert result.paragraphs[0].text == "Chapitre Un"
    # Round files written.
    chdir = Path(ingested.book_dir) / "chapters" / "ch01"
    assert (chdir / "round-1-editor.docx").exists()
    assert (chdir / "round-1-editor.json").exists()


async def test_run_editor_pass_raises_recoverable_on_paragraph_count_mismatch(ingested) -> None:
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="a"), Paragraph(style="normal", text="b")])
    tr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="a"), Paragraph(style="normal", text="b")])
    bad_response = "[1]\nFR: only one\n"  # missing block 2
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=bad_response)
    with pytest.raises(RecoverableError):
        await run_editor_pass(
            client=fake_client,
            slug=ingested.slug, chapter_n=1, round_n=1,
            en_doc=en, target_doc=tr,
            source_code="en", target_code="fr",
            editor_prompt_template="x",
            prior_reviewer_suggestions=None,
            model="m",
        )


import json as _json

from server.rounds import run_reviewer_pass


async def test_run_reviewer_pass_persists_suggestions(ingested) -> None:
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Hello.")])
    tr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Bonjour.")])
    suggestions_json = '[{"quote": "Bonjour.", "comment": "consider Salut"}]'
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=suggestions_json)

    result = await run_reviewer_pass(
        client=fake_client,
        slug=ingested.slug,
        chapter_n=1,
        round_n=1,
        en_doc=en,
        target_doc=tr,
        source_code="en",
        target_code="fr",
        reviewer_prompt_template="x",
        model="openai/gpt-5",
    )
    assert result.suggestions[0].quote == "Bonjour."
    f = Path(ingested.book_dir) / "chapters" / "ch01" / "round-1-reviewer.json"
    assert f.exists()
    data = _json.loads(f.read_text())
    assert data["raw_response"] == suggestions_json


async def test_run_reviewer_pass_keeps_raw_when_parse_fails(ingested) -> None:
    en = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Hello.")])
    tr = ParsedDoc(paragraphs=[Paragraph(style="normal", text="Bonjour.")])
    bad_json = "this is not JSON at all"
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=bad_json)

    result = await run_reviewer_pass(
        client=fake_client,
        slug=ingested.slug, chapter_n=1, round_n=1,
        en_doc=en, target_doc=tr,
        source_code="en", target_code="fr",
        reviewer_prompt_template="x",
        model="m",
    )
    assert result.suggestions == []
    assert result.raw_response == bad_json
