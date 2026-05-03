from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.config import Config, load_config
from server.docx_io import ParsedDoc
from server.errors import ConfigurationError, RecoverableError, TransientError
from server.finalize import FinalizeError, finalize_chapter
from server.openrouter import OpenRouterClient
from server.paths import book_dir
from server.prompts import PromptKind, load_prompts
from server.rounds import (
    ReviewerResult,
    run_editor_pass,
    run_reviewer_pass,
)
from server.state import (
    ChapterMeta,
    ChapterStatus,
    Models,
    PromptsUsed,
    RoundEntry,
    load_book_meta,
    load_chapter_meta,
    now_iso,
    save_chapter_meta,
)
from server.main import EVENT_BUS

router = APIRouter()


class RoundRequest(BaseModel):
    model: str


def _make_client(cfg: Config) -> OpenRouterClient:
    if not cfg.openrouter_api_key:
        raise ConfigurationError("OpenRouter API key not configured")
    return OpenRouterClient(api_key=cfg.openrouter_api_key)


def _load_source(slug: str, n: int) -> tuple[ParsedDoc, ParsedDoc]:
    bd = book_dir(slug)
    en = ParsedDoc.model_validate_json((bd / "source-en" / f"ch{n:02d}.json").read_text())
    tr = ParsedDoc.model_validate_json((bd / "source-translated" / f"ch{n:02d}.json").read_text())
    return en, tr


def _current_target_doc(slug: str, n: int, current_round: int) -> ParsedDoc:
    bd = book_dir(slug)
    if current_round < 1:
        return ParsedDoc.model_validate_json((bd / "source-translated" / f"ch{n:02d}.json").read_text())
    return ParsedDoc.model_validate_json(
        (bd / "chapters" / f"ch{n:02d}" / f"round-{current_round}-editor.json").read_text()
    )


def _last_reviewer_suggestions(slug: str, n: int, round_n: int) -> Optional[list]:
    if round_n < 1:
        return None
    p = book_dir(slug) / "chapters" / f"ch{n:02d}" / f"round-{round_n}-reviewer.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text())
    return data.get("suggestions") or None


@router.get("/books/{slug}/chapter/{n}/state")
def get_chapter_state(slug: str, n: int) -> dict:
    try:
        load_book_meta(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
    return load_chapter_meta(slug, n=n).model_dump()


@router.post("/books/{slug}/chapter/{n}/round/editor")
async def post_round_editor(slug: str, n: int, req: RoundRequest) -> dict:
    cfg = load_config()
    try:
        client = _make_client(cfg)
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    bm = load_book_meta(slug)
    cm = load_chapter_meta(slug, n=n)
    next_round = cm.current_round + 1
    en_doc, _ = _load_source(slug, n)
    target_doc = _current_target_doc(slug, n, cm.current_round)
    suggestions = _last_reviewer_suggestions(slug, n, cm.current_round)
    editor_prompt = load_prompts(PromptKind.EDITOR)
    editor_template = next(v.text for v in editor_prompt.versions if v.id == editor_prompt.current)

    EVENT_BUS.publish({"type": "status", "text": f"Round {next_round} — calling Editor ({req.model})..."})
    try:
        await run_editor_pass(
            client=client,
            slug=slug,
            chapter_n=n,
            round_n=next_round,
            en_doc=en_doc,
            target_doc=target_doc,
            source_code=bm.language_pair.from_,
            target_code=bm.language_pair.to,
            editor_prompt_template=editor_template,
            prior_reviewer_suggestions=suggestions,
            model=req.model,
            on_retry=lambda attempt, total: EVENT_BUS.publish(
                {"type": "status", "text": f"Round {next_round} — retry {attempt}/{total}..."}
            ),
        )
    except RecoverableError as exc:
        EVENT_BUS.publish({"type": "error", "text": str(exc)})
        raise HTTPException(status_code=422, detail={"message": str(exc), "kind": "recoverable"})
    except TransientError as exc:
        EVENT_BUS.publish({"type": "error", "text": str(exc)})
        raise HTTPException(status_code=502, detail={"message": str(exc), "kind": "transient"})
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    EVENT_BUS.publish({"type": "round_complete", "round": next_round, "stage": "editor"})

    cm.current_round = next_round
    cm.status = ChapterStatus.IN_PROGRESS
    cm.models.editor = req.model
    cm.prompts_used.editor_version = editor_prompt.current
    cm.rounds.append(RoundEntry(n=next_round, editor_completed_at=now_iso()))
    save_chapter_meta(slug, cm)
    return cm.model_dump()


@router.post("/books/{slug}/chapter/{n}/round/reviewer")
async def post_round_reviewer(slug: str, n: int, req: RoundRequest) -> dict:
    cfg = load_config()
    try:
        client = _make_client(cfg)
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    bm = load_book_meta(slug)
    cm = load_chapter_meta(slug, n=n)
    if cm.current_round < 1:
        raise HTTPException(status_code=400, detail="no Editor pass yet for this chapter")
    en_doc, _ = _load_source(slug, n)
    target_doc = _current_target_doc(slug, n, cm.current_round)
    reviewer_prompt = load_prompts(PromptKind.REVIEWER)
    reviewer_template = next(v.text for v in reviewer_prompt.versions if v.id == reviewer_prompt.current)

    EVENT_BUS.publish({"type": "status", "text": f"Round {cm.current_round} — calling Reviewer ({req.model})..."})
    try:
        result: ReviewerResult = await run_reviewer_pass(
            client=client,
            slug=slug,
            chapter_n=n,
            round_n=cm.current_round,
            en_doc=en_doc,
            target_doc=target_doc,
            source_code=bm.language_pair.from_,
            target_code=bm.language_pair.to,
            reviewer_prompt_template=reviewer_template,
            model=req.model,
            on_retry=lambda attempt, total: EVENT_BUS.publish(
                {"type": "status", "text": f"Round {cm.current_round} — retry {attempt}/{total}..."}
            ),
        )
    except TransientError as exc:
        EVENT_BUS.publish({"type": "error", "text": str(exc)})
        raise HTTPException(status_code=502, detail={"message": str(exc), "kind": "transient"})
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    EVENT_BUS.publish({"type": "round_complete", "round": cm.current_round, "stage": "reviewer"})
    cm.models.reviewer = req.model
    cm.prompts_used.reviewer_version = reviewer_prompt.current
    # Update the round's reviewer_completed_at.
    for entry in cm.rounds:
        if entry.n == cm.current_round:
            entry.reviewer_completed_at = now_iso()
            break
    save_chapter_meta(slug, cm)
    return result.model_dump()


@router.post("/books/{slug}/chapter/{n}/finalize")
def post_finalize(slug: str, n: int) -> dict:
    try:
        finalize_chapter(slug=slug, chapter_n=n)
    except FinalizeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return load_chapter_meta(slug, n=n).model_dump()
