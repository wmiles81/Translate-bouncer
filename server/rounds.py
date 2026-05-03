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
    "en-gb": "British English",
    "fr": "French",
    "es": "Spanish",
    "es-es": "European Spanish",
    "es-419": "Latin American Spanish",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "pt-pt": "European Portuguese",
    "pt-br": "Brazilian Portuguese",
    "nl": "Dutch",
    "pl": "Polish",
    "uk": "Ukrainian",
    "sv": "Swedish",
    "ru": "Russian",
    "ja": "Japanese",
    "zh": "Chinese",
    "ko": "Korean",
    "ar": "Arabic",
    "he": "Hebrew",
}


def _lang_name(code: str) -> str:
    """Resolve a language code to a display name.

    Tries the full code first (e.g. "pt-BR" -> "Brazilian Portuguese"), then
    falls back to the base subtag (e.g. "pt-XX" -> "Portuguese"), then
    uppercases the original code as a last resort.
    """
    key = code.lower()
    if key in LANGUAGE_NAMES:
        return LANGUAGE_NAMES[key]
    base = key.split("-", 1)[0]
    if base in LANGUAGE_NAMES:
        return LANGUAGE_NAMES[base]
    return code.upper()


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


import re
from typing import List

from pydantic import BaseModel, Field

from server.state import now_iso


class Suggestion(BaseModel):
    id: int
    quote: str
    comment: str


class ReviewerResult(BaseModel):
    round: int
    model: str
    completed_at: str
    suggestions: List[Suggestion] = Field(default_factory=list)
    raw_response: str


_JSON_LIST_RE = re.compile(r"\[\s*[\{\]].*\]", re.DOTALL)


def _try_parse_suggestions(raw: str) -> List[Suggestion]:
    candidate = raw.strip()
    # If the model wrapped JSON in prose, try to extract the first JSON list.
    if not candidate.startswith("["):
        m = _JSON_LIST_RE.search(candidate)
        if m:
            candidate = m.group(0)
        else:
            return []
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        return []
    out: List[Suggestion] = []
    for i, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            continue
        q = item.get("quote")
        c = item.get("comment")
        if isinstance(q, str) and isinstance(c, str):
            out.append(Suggestion(id=i, quote=q, comment=c))
    return out


async def run_reviewer_pass(
    *,
    client: OpenRouterClient,
    slug: str,
    chapter_n: int,
    round_n: int,
    en_doc: ParsedDoc,
    target_doc: ParsedDoc,
    source_code: str,
    target_code: str,
    reviewer_prompt_template: str,
    model: str,
    on_retry=None,
) -> ReviewerResult:
    payload = render_payload(en_doc, target_doc, source_code=source_code, target_code=target_code)
    system = render_reviewer_prompt(template=reviewer_prompt_template, target_code=target_code)
    raw = await client.chat(model=model, system=system, user=payload, on_retry=on_retry)

    suggestions = _try_parse_suggestions(raw)
    result = ReviewerResult(
        round=round_n,
        model=model,
        completed_at=now_iso(),
        suggestions=suggestions,
        raw_response=raw,
    )
    cdir = _chapter_dir(slug, chapter_n)
    (cdir / f"round-{round_n}-reviewer.json").write_text(result.model_dump_json(indent=2))
    return result
