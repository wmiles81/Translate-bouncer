from __future__ import annotations

from pathlib import Path

import pytest

from server.prompts import (
    PromptKind,
    delete_version,
    list_versions,
    load_prompts,
    restore_version,
    save_new_version,
)


def test_load_returns_seeded_v1_when_missing(translate_root: Path) -> None:
    data = load_prompts(PromptKind.EDITOR)
    assert data.current == "v1"
    assert len(data.versions) == 1
    assert data.versions[0].id == "v1"
    assert "proofreading" in data.versions[0].text.lower()


def test_save_new_version_increments_id_and_promotes_current(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "Edited prompt v2 text.")
    data = load_prompts(PromptKind.EDITOR)
    assert data.current == "v2"
    assert len(data.versions) == 2
    assert data.versions[-1].text == "Edited prompt v2 text."


def test_list_versions_returns_in_save_order(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    save_new_version(PromptKind.EDITOR, "v3 text")
    versions = list_versions(PromptKind.EDITOR)
    assert [v.id for v in versions] == ["v1", "v2", "v3"]


def test_restore_creates_new_entry_with_old_text(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    save_new_version(PromptKind.EDITOR, "v3 text")
    restore_version(PromptKind.EDITOR, "v1")
    data = load_prompts(PromptKind.EDITOR)
    assert data.current == "v4"
    assert data.versions[-1].id == "v4"
    assert data.versions[-1].text == data.versions[0].text  # v1's text


def test_delete_removes_historical_version(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    save_new_version(PromptKind.EDITOR, "v3 text")
    delete_version(PromptKind.EDITOR, "v1")
    versions = list_versions(PromptKind.EDITOR)
    assert [v.id for v in versions] == ["v2", "v3"]


def test_delete_current_version_raises(translate_root: Path) -> None:
    save_new_version(PromptKind.EDITOR, "v2 text")
    with pytest.raises(ValueError, match="current"):
        delete_version(PromptKind.EDITOR, "v2")


def test_reviewer_seeded_independently(translate_root: Path) -> None:
    e = load_prompts(PromptKind.EDITOR)
    r = load_prompts(PromptKind.REVIEWER)
    assert e.versions[0].text != r.versions[0].text
    assert "json" in r.versions[0].text.lower()
