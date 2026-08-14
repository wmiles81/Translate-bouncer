"""Typed read/write of book and chapter meta.json files."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

from server.paths import book_dir, translate_root


class ChapterStatus(str, Enum):
    UNTOUCHED = "untouched"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class LanguagePair(BaseModel):
    from_: str = Field(alias="from")
    to: str

    model_config = {"populate_by_name": True}


class SourceRef(BaseModel):
    path: str
    format: str


class BookSources(BaseModel):
    translated: SourceRef
    english: SourceRef


class ChapterEntry(BaseModel):
    n: int
    title: str
    status: ChapterStatus = ChapterStatus.UNTOUCHED


class BookMeta(BaseModel):
    slug: str
    created_at: str
    sources: BookSources
    language_pair: LanguagePair
    chapters: List[ChapterEntry]
    # Removed from the app's book list. Files stay on disk under
    # ~/.translate/<slug>/ — clearing this flag brings the book back.
    hidden: bool = False


class Models(BaseModel):
    editor: str = ""
    reviewer: str = ""


class PromptsUsed(BaseModel):
    editor_version: Optional[str] = None
    reviewer_version: Optional[str] = None


class RoundEntry(BaseModel):
    n: int
    editor_completed_at: Optional[str] = None
    reviewer_completed_at: Optional[str] = None
    # The in-round pass that applies this round's reviewer suggestions. A round
    # is complete once this is set; it does NOT start a new round.
    revised_completed_at: Optional[str] = None


class ChapterMeta(BaseModel):
    n: int
    status: ChapterStatus = ChapterStatus.UNTOUCHED
    current_round: int = 0
    models: Models = Field(default_factory=Models)
    prompts_used: PromptsUsed = Field(default_factory=PromptsUsed)
    rounds: List[RoundEntry] = Field(default_factory=list)


def load_book_meta(slug: str) -> BookMeta:
    p = book_dir(slug) / "meta.json"
    return BookMeta.model_validate_json(p.read_text())


def save_book_meta(meta: BookMeta) -> None:
    p = book_dir(meta.slug) / "meta.json"
    p.write_text(meta.model_dump_json(indent=2, by_alias=True))


def load_chapter_meta(slug: str, *, n: int) -> ChapterMeta:
    p = book_dir(slug) / "chapters" / f"ch{n:02d}" / "meta.json"
    if not p.exists():
        return ChapterMeta(n=n)
    return ChapterMeta.model_validate_json(p.read_text())


def save_chapter_meta(slug: str, meta: ChapterMeta) -> None:
    cdir = book_dir(slug) / "chapters" / f"ch{meta.n:02d}"
    cdir.mkdir(parents=True, exist_ok=True)
    (cdir / "meta.json").write_text(meta.model_dump_json(indent=2))


def list_books() -> List[str]:
    root = translate_root()
    if not root.exists():
        return []
    def _visible(d) -> bool:
        try:
            return not json.loads((d / "meta.json").read_text()).get("hidden", False)
        except Exception:  # noqa: BLE001 - unreadable meta: still list it
            return True

    return sorted(
        d.name
        for d in root.iterdir()
        if d.is_dir() and (d / "meta.json").exists() and _visible(d)
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
