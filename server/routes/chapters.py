from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.acp_providers import AcpProviderClient, require_provider
from server.docx_io import ParsedDoc
from server.errors import ConfigurationError, RecoverableError, TransientError
from server.finalize import FinalizeError, finalize_chapter
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


def _make_client(model: str) -> AcpProviderClient:
    require_provider(model)
    return AcpProviderClient()


class _TokenCoalescer:
    """Buffers streamed chunks; publishes one token event per ~300 chars.

    A 5000-token round would otherwise publish thousands of SSE events and force a
    client re-render per token. Call ``flush()`` after the pass returns (success or
    failure) so the tail is not lost.
    """

    def __init__(self, publish, threshold: int = 300) -> None:
        self._publish = publish
        self._threshold = threshold
        self._buf: list[str] = []
        self._size = 0

    def __call__(self, chunk: str) -> None:
        self._buf.append(chunk)
        self._size += len(chunk)
        if self._size >= self._threshold:
            self.flush()

    def flush(self) -> None:
        if self._buf:
            self._publish("".join(self._buf))
            self._buf.clear()
            self._size = 0


def _round_callbacks(chapter: int, round_n: int, stage: str):
    """on_retry / on_token / on_notice publishers shared by the editor and reviewer routes."""

    def on_retry(attempt: int, total: int) -> None:
        EVENT_BUS.publish({
            "type": "status", "chapter": chapter, "round": round_n, "stage": stage,
            "phase": "retry",
            "text": f"Ch {chapter} R{round_n} {stage.capitalize()} — retry {attempt}/{total}...",
        })

    coalescer = _TokenCoalescer(lambda text: EVENT_BUS.publish({
        "type": "token", "chapter": chapter, "round": round_n, "stage": stage, "text": text,
    }))

    def on_notice(text: str) -> None:
        EVENT_BUS.publish({
            "type": "status", "chapter": chapter, "round": round_n, "stage": stage,
            "phase": "notice",
            "text": f"Ch {chapter} R{round_n} {stage.capitalize()} — {text}",
        })

    return on_retry, coalescer, on_notice


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
    try:
        client = _make_client(req.model)
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

    # Source description: round 0 = original translation, otherwise the previous editor output.
    src_round = cm.current_round  # the working doc's round number we feed to the editor
    src_desc = (
        "original translation"
        if src_round == 0
        else f"round {src_round} editor output"
    )
    if suggestions:
        src_desc += f" + {len(suggestions)} reviewer suggestions"
    EVENT_BUS.publish({
        "type": "status",
        "chapter": n,
        "round": next_round,
        "stage": "editor",
        "phase": "sent",
        "model": req.model,
        "source": src_desc,
        "text": f"Ch {n} R{next_round} → Editor ({req.model}) · source: {src_desc}",
    })
    on_retry, on_token, on_notice = _round_callbacks(n, next_round, "editor")
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
            on_retry=on_retry,
            on_token=on_token,
            on_notice=on_notice,
        )
    except RecoverableError as exc:
        EVENT_BUS.publish({"type": "error", "chapter": n, "round": next_round, "stage": "editor", "text": str(exc)})
        raise HTTPException(status_code=422, detail={"message": str(exc), "kind": "recoverable"})
    except TransientError as exc:
        EVENT_BUS.publish({"type": "error", "chapter": n, "round": next_round, "stage": "editor", "text": str(exc)})
        raise HTTPException(status_code=502, detail={"message": str(exc), "kind": "transient"})
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        on_token.flush()
    EVENT_BUS.publish({
        "type": "status",
        "chapter": n,
        "round": next_round,
        "stage": "editor",
        "phase": "returned",
        "text": f"Ch {n} R{next_round} ← Editor returned",
    })
    EVENT_BUS.publish({"type": "round_complete", "round": next_round, "stage": "editor", "chapter": n})

    cm.current_round = next_round
    cm.status = ChapterStatus.IN_PROGRESS
    cm.models.editor = req.model
    cm.prompts_used.editor_version = editor_prompt.current
    cm.rounds.append(RoundEntry(n=next_round, editor_completed_at=now_iso()))
    save_chapter_meta(slug, cm)
    return cm.model_dump()


@router.post("/books/{slug}/chapter/{n}/round/reviewer")
async def post_round_reviewer(slug: str, n: int, req: RoundRequest) -> dict:
    try:
        client = _make_client(req.model)
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

    review_round = cm.current_round
    src_desc = f"round {review_round} editor output"
    EVENT_BUS.publish({
        "type": "status",
        "chapter": n,
        "round": review_round,
        "stage": "reviewer",
        "phase": "sent",
        "model": req.model,
        "source": src_desc,
        "text": f"Ch {n} R{review_round} → Reviewer ({req.model}) · source: {src_desc}",
    })
    on_retry, on_token, on_notice = _round_callbacks(n, review_round, "reviewer")
    try:
        result: ReviewerResult = await run_reviewer_pass(
            client=client,
            slug=slug,
            chapter_n=n,
            round_n=review_round,
            en_doc=en_doc,
            target_doc=target_doc,
            source_code=bm.language_pair.from_,
            target_code=bm.language_pair.to,
            reviewer_prompt_template=reviewer_template,
            model=req.model,
            on_retry=on_retry,
            on_token=on_token,
            on_notice=on_notice,
        )
    except TransientError as exc:
        EVENT_BUS.publish({"type": "error", "chapter": n, "round": review_round, "stage": "reviewer", "text": str(exc)})
        raise HTTPException(status_code=502, detail={"message": str(exc), "kind": "transient"})
    except ConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        on_token.flush()
    n_sugg = len(result.suggestions) if hasattr(result, "suggestions") and result.suggestions else 0
    EVENT_BUS.publish({
        "type": "status",
        "chapter": n,
        "round": review_round,
        "stage": "reviewer",
        "phase": "returned",
        "text": f"Ch {n} R{review_round} ← Reviewer returned {n_sugg} suggestion{'s' if n_sugg != 1 else ''}",
    })
    EVENT_BUS.publish({"type": "round_complete", "round": review_round, "stage": "reviewer", "chapter": n})
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


@router.get("/books/{slug}/chapter/{n}/dialog")
def get_chapter_dialog(slug: str, n: int) -> dict:
    """Return per-round raw editor/reviewer exchanges for the dialog view."""
    try:
        load_book_meta(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
    cm = load_chapter_meta(slug, n=n)
    cdir = book_dir(slug) / "chapters" / f"ch{n:02d}"
    rounds: list[dict] = []
    for r in range(1, cm.current_round + 1):
        editor_raw_p = cdir / f"round-{r}-editor.raw.txt"
        reviewer_p = cdir / f"round-{r}-reviewer.json"
        editor_raw = editor_raw_p.read_text() if editor_raw_p.exists() else None
        reviewer_raw: Optional[str] = None
        suggestions: Optional[list] = None
        reviewer_model: Optional[str] = None
        if reviewer_p.exists():
            data = json.loads(reviewer_p.read_text())
            reviewer_raw = data.get("raw_response")
            suggestions = data.get("suggestions") or []
            reviewer_model = data.get("model")
        rounds.append({
            "n": r,
            "editor_model": cm.models.editor,
            "editor_raw": editor_raw,
            "reviewer_model": reviewer_model or cm.models.reviewer,
            "reviewer_raw": reviewer_raw,
            "suggestions": suggestions,
        })
    return {"rounds": rounds}


@router.get("/books/{slug}/chapter/{n}/docs")
def get_chapter_docs(slug: str, n: int) -> dict:
    """Return parsed-doc JSON for english, working (latest), previous, and reviewer suggestions."""
    try:
        load_book_meta(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
    cm = load_chapter_meta(slug, n=n)
    bd = book_dir(slug)
    en_path = bd / "source-en" / f"ch{n:02d}.json"
    tr_path = bd / "source-translated" / f"ch{n:02d}.json"
    if not en_path.exists() or not tr_path.exists():
        raise HTTPException(status_code=404, detail=f"chapter {n} not in book {slug}")

    english = ParsedDoc.model_validate_json(en_path.read_text()).model_dump()
    if cm.current_round < 1:
        working = ParsedDoc.model_validate_json(tr_path.read_text()).model_dump()
        previous = None
    else:
        wp = bd / "chapters" / f"ch{n:02d}" / f"round-{cm.current_round}-editor.json"
        working = ParsedDoc.model_validate_json(wp.read_text()).model_dump()
        if cm.current_round == 1:
            previous = ParsedDoc.model_validate_json(tr_path.read_text()).model_dump()
        else:
            pp = bd / "chapters" / f"ch{n:02d}" / f"round-{cm.current_round - 1}-editor.json"
            previous = ParsedDoc.model_validate_json(pp.read_text()).model_dump()

    sp = bd / "chapters" / f"ch{n:02d}" / f"round-{cm.current_round}-reviewer.json"
    suggestions = None
    if sp.exists():
        import json
        suggestions = json.loads(sp.read_text())

    return {
        "english": english,
        "working": working,
        "previous": previous,
        "suggestions": suggestions,
    }
