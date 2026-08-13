"""Real-agent smoke test. Skipped unless TRANSLATE_E2E_MODEL is set.

Run manually before each release, with that provider's CLI installed and signed in:

    TRANSLATE_E2E_MODEL=claude-code/sonnet pytest tests/server/test_e2e_smoke.py -v -s
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from server.acp_providers import AcpProviderClient, shutdown_manager
from server.config import Config
from server.docx_io import parse_docx
from server.ingest import ingest_book
from server.rounds import run_editor_pass, run_reviewer_pass

pytestmark = pytest.mark.skipif(
    "TRANSLATE_E2E_MODEL" not in os.environ,
    reason="set TRANSLATE_E2E_MODEL (e.g. claude-code/sonnet) to run the e2e test",
)


async def test_real_round_against_local_agent(translate_root: Path, fixtures_dir: Path) -> None:
    model = os.environ["TRANSLATE_E2E_MODEL"]
    result = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=Config().ingestion,
    )
    en = parse_docx(translate_root / result.slug / "source-en" / "ch01.docx")
    fr = parse_docx(translate_root / result.slug / "source-translated" / "ch01.docx")
    client = AcpProviderClient()
    try:
        edited = await run_editor_pass(
            client=client,
            slug=result.slug,
            chapter_n=1,
            round_n=1,
            en_doc=en,
            target_doc=fr,
            source_code="en",
            target_code="fr",
            editor_prompt_template=(
                "Proofread the {TARGET_LANG_NAME} translation. Return target lines only "
                "in `{TARGET_LANG_CODE}:` format, one per `[N]` block. Preserve italic and bold."
            ),
            prior_reviewer_suggestions=None,
            model=model,
        )
        assert len(edited.paragraphs) == len(en.paragraphs)

        reviewer_result = await run_reviewer_pass(
            client=client,
            slug=result.slug,
            chapter_n=1,
            round_n=1,
            en_doc=en,
            target_doc=edited,
            source_code="en",
            target_code="fr",
            reviewer_prompt_template=(
                "Review the {TARGET_LANG_NAME} translation. Return JSON list of "
                '{"quote", "comment"} only. Be concise.'
            ),
            model=model,
        )
        assert reviewer_result.raw_response  # something came back
    finally:
        await shutdown_manager()
