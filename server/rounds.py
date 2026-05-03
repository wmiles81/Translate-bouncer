"""Editor and Reviewer round passes."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from server.docx_io import ParsedDoc, write_docx
from server.errors import RecoverableError
from server.openrouter import OpenRouterClient
from server.paths import book_dir
from server.payload import PayloadParseError, parse_target_lines, render_payload

LANGUAGE_NAMES = {
    "en": "English",
    "fr": "French",
    "es": "Spanish",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "nl": "Dutch",
    "pl": "Polish",
    "ru": "Russian",
    "ja": "Japanese",
    "zh": "Chinese",
    "ko": "Korean",
    "ar": "Arabic",
    "he": "Hebrew",
}


def _lang_name(code: str) -> str:
    return LANGUAGE_NAMES.get(code.lower(), code.upper())


def render_editor_prompt(*, template: str, target_code: str) -> str:
    return template.replace("{TARGET_LANG_CODE}", target_code.upper()).replace(
        "{TARGET_LANG_NAME}", _lang_name(target_code)
    )


def render_reviewer_prompt(*, template: str, target_code: str) -> str:
    return template.replace("{TARGET_LANG_CODE}", target_code.upper()).replace(
        "{TARGET_LANG_NAME}", _lang_name(target_code)
    )


def _chapter_dir(slug: str, n: int) -> Path:
    d = book_dir(slug) / "chapters" / f"ch{n:02d}"
    d.mkdir(parents=True, exist_ok=True)
    return d


async def run_editor_pass(
    *,
    client: OpenRouterClient,
    slug: str,
    chapter_n: int,
    round_n: int,
    en_doc: ParsedDoc,
    target_doc: ParsedDoc,
    source_code: str,
    target_code: str,
    editor_prompt_template: str,
    prior_reviewer_suggestions: Optional[list],
    model: str,
    on_retry=None,
) -> ParsedDoc:
    """Run the Editor pass and persist round-N-editor.{docx,json}."""
    payload = render_payload(en_doc, target_doc, source_code=source_code, target_code=target_code)
    user_msg = payload
    if prior_reviewer_suggestions:
        user_msg = (
            "Prior reviewer suggestions (incorporate the ones you agree with):\n"
            + json.dumps(prior_reviewer_suggestions, ensure_ascii=False, indent=2)
            + "\n\n"
            + payload
        )
    system = render_editor_prompt(template=editor_prompt_template, target_code=target_code)
    raw = await client.chat(model=model, system=system, user=user_msg, on_retry=on_retry)

    try:
        edited = parse_target_lines(
            raw,
            target_code=target_code,
            expected_count=len(en_doc.paragraphs),
        )
    except PayloadParseError as exc:
        raise RecoverableError(str(exc)) from exc

    cdir = _chapter_dir(slug, chapter_n)
    write_docx(edited, cdir / f"round-{round_n}-editor.docx")
    (cdir / f"round-{round_n}-editor.json").write_text(edited.model_dump_json(indent=2))
    return edited
