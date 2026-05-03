"""Prompt versioning for the Editor and Reviewer system prompts.

Each prompt file stores: {"current": "vN", "versions": [{"id":..., "saved_at":..., "text":...}]}.
- Restoring an old version creates a new entry with its text and promotes it to current.
- Deleting the current version is forbidden.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List

from pydantic import BaseModel, Field

from server.paths import prompts_dir, translate_root


class PromptKind(str, Enum):
    EDITOR = "editor"
    REVIEWER = "reviewer"


class PromptVersion(BaseModel):
    id: str
    saved_at: str
    text: str


class PromptFile(BaseModel):
    current: str
    versions: List[PromptVersion] = Field(default_factory=list)


SEED_EDITOR = (
    "You are proofreading a chapter of a novel that has been translated by AI into "
    "{TARGET_LANG_NAME}. You will receive the English original and the current "
    "translation, paragraph by paragraph and aligned by index.\n\n"
    "Proof the translation only. Do not edit the book itself — do not change plot, "
    "characters, voice, pacing, or authorial choices. Your job is linguistic, not "
    "editorial.\n\n"
    "Use the English source as a reference for the author's voice, style, and tone. "
    "Fix awkward phrasing, unnatural word order, translation artifacts, register "
    "mismatches, idioms that don't land, and anything that sounds machine-translated. "
    "Preserve the author's style and tone — if the original is informal, stay informal; "
    "if it's literary, stay literary.\n\n"
    "If a previous reviewer's suggestions are provided, incorporate the ones you agree "
    "with and ignore those you don't. Do not explain your decisions.\n\n"
    "Return only the revised translation, in the exact paragraph-aligned format you "
    "received, with one `{TARGET_LANG_CODE}:` line per paragraph and nothing else."
)

SEED_REVIEWER = (
    "You are reviewing a chapter of a novel that has been translated by AI into "
    "{TARGET_LANG_NAME} and then proofread. You will receive the English original and "
    "the current translation, paragraph by paragraph and aligned by index.\n\n"
    "Identify what should change to make the translation read like it was written by "
    "a native speaker of the target language while remaining faithful to the author's "
    "voice, style, and tone in the English source. Do not suggest editorial changes — "
    "your suggestions must be linguistic, not creative.\n\n"
    "The user does not speak the target language. Communicate to them in English.\n\n"
    "Return a JSON list of suggestions. Each entry must have `quote` (the translation "
    "snippet to change) and `comment` (what should change and why). Return only the "
    "JSON list, no preamble or commentary."
)


def _path(kind: PromptKind):
    return prompts_dir() / f"{kind.value}.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _seed(kind: PromptKind) -> PromptFile:
    text = SEED_EDITOR if kind == PromptKind.EDITOR else SEED_REVIEWER
    return PromptFile(
        current="v1",
        versions=[PromptVersion(id="v1", saved_at=_now(), text=text)],
    )


def load_prompts(kind: PromptKind) -> PromptFile:
    p = _path(kind)
    if not p.exists():
        seeded = _seed(kind)
        prompts_dir().mkdir(parents=True, exist_ok=True)
        p.write_text(seeded.model_dump_json(indent=2))
        return seeded
    return PromptFile.model_validate_json(p.read_text())


def list_versions(kind: PromptKind) -> List[PromptVersion]:
    return load_prompts(kind).versions


def _next_id(existing: List[PromptVersion]) -> str:
    nums = [int(v.id[1:]) for v in existing if v.id.startswith("v") and v.id[1:].isdigit()]
    return f"v{(max(nums) if nums else 0) + 1}"


def save_new_version(kind: PromptKind, text: str) -> str:
    data = load_prompts(kind)
    new_id = _next_id(data.versions)
    data.versions.append(PromptVersion(id=new_id, saved_at=_now(), text=text))
    data.current = new_id
    _path(kind).write_text(data.model_dump_json(indent=2))
    return new_id


def restore_version(kind: PromptKind, version_id: str) -> str:
    data = load_prompts(kind)
    target = next((v for v in data.versions if v.id == version_id), None)
    if target is None:
        raise ValueError(f"unknown version {version_id}")
    return save_new_version(kind, target.text)


def delete_version(kind: PromptKind, version_id: str) -> None:
    data = load_prompts(kind)
    if data.current == version_id:
        raise ValueError(f"cannot delete current version {version_id}")
    data.versions = [v for v in data.versions if v.id != version_id]
    _path(kind).write_text(data.model_dump_json(indent=2))
