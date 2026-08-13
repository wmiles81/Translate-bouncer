from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from server.config import Config, save_config
from server.errors import TransientError
from server.main import create_app
from server.routes import chapters as chapters_routes


@pytest.fixture
def app_with_book(translate_root: Path, fixtures_dir: Path, monkeypatch):
    save_config(Config(default_models={"editor": "ed", "reviewer": "rv"}))
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug = r.json()["slug"]
    return client, slug


def test_get_chapter_state_initial(app_with_book) -> None:
    client, slug = app_with_book
    r = client.get(f"/books/{slug}/chapter/1/state")
    assert r.status_code == 200
    body = r.json()
    assert body["n"] == 1
    assert body["status"] == "untouched"
    assert body["current_round"] == 0


# Chapter 1 from the fixture has 4 paragraphs: heading + 3 body paragraphs.
_EDITOR_MOCK_RESPONSE = (
    "[1]\nFR: # Chapitre 1\n\n"
    "[2]\nFR: Le matin où tout commença, il pleuvait encore.\n\n"
    "[3]\nFR: Salut\n\n"
    "[4]\nFR: La main *froide*\n"
)


def test_post_round_editor_runs_pass(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book

    # Force the route to use a mocked client.
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=_EDITOR_MOCK_RESPONSE)
    monkeypatch.setattr(chapters_routes, "_make_client", lambda model: fake_client)

    r = client.post(
        f"/books/{slug}/chapter/1/round/editor",
        json={"model": "anthropic/claude-sonnet-4"},
    )
    assert r.status_code == 200
    state = client.get(f"/books/{slug}/chapter/1/state").json()
    assert state["current_round"] == 1
    assert state["status"] == "in_progress"


def test_post_round_reviewer_after_editor(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(side_effect=[
        _EDITOR_MOCK_RESPONSE,
        '[{"quote": "Salut", "comment": "consider Bonjour"}]',
    ])
    monkeypatch.setattr(chapters_routes, "_make_client", lambda model: fake_client)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    r = client.post(f"/books/{slug}/chapter/1/round/reviewer", json={"model": "rv"})
    assert r.status_code == 200
    body = r.json()
    assert body["suggestions"][0]["quote"] == "Salut"


def test_post_finalize_marks_done(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=_EDITOR_MOCK_RESPONSE)
    monkeypatch.setattr(chapters_routes, "_make_client", lambda model: fake_client)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    r = client.post(f"/books/{slug}/chapter/1/finalize")
    assert r.status_code == 200
    state = client.get(f"/books/{slug}/chapter/1/state").json()
    assert state["status"] == "done"


def test_post_round_editor_returns_502_on_transient_error(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(side_effect=TransientError("upstream 503"))
    monkeypatch.setattr(chapters_routes, "_make_client", lambda model: fake_client)
    r = client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    assert r.status_code == 502
    body = r.json()
    assert body["detail"]["kind"] == "transient"
    assert "503" in body["detail"]["message"]


def test_get_chapter_docs_returns_english_and_translated(app_with_book) -> None:
    client, slug = app_with_book
    r = client.get(f"/books/{slug}/chapter/1/docs")
    assert r.status_code == 200
    body = r.json()
    assert "english" in body
    assert "working" in body  # source-translated when no round yet
    assert body["previous"] is None  # no prior round
    assert body["suggestions"] is None
    # English doc has a non-empty paragraphs list
    assert len(body["english"]["paragraphs"]) > 0


def test_round_rejects_openrouter_model_without_key_before_any_event(app_with_book) -> None:
    """Non-CLI model ids route to OpenRouter; without a key that's a clean 400 upfront."""
    client, slug = app_with_book
    r = client.post(
        f"/books/{slug}/chapter/1/round/editor",
        json={"model": "anthropic/claude-sonnet-4"},
    )
    assert r.status_code == 400
    assert "OpenRouter" in r.json()["detail"]
    assert "anthropic/claude-sonnet-4" in r.json()["detail"]


def test_make_client_routes_by_model_namespace(translate_root, monkeypatch) -> None:
    from server.acp_providers import AcpProviderClient
    from server.config import Config, save_config
    from server.openrouter import OpenRouterClient
    from server.routes.chapters import _make_client

    # CLI namespace -> ACP client (detection satisfied via monkeypatch).
    import server.acp_providers as ap
    monkeypatch.setattr(
        ap, "detect_providers",
        lambda: [{"id": pid, "name": ap._PROVIDER_NAMES[pid], "detected": True}
                 for pid in ap.PROVIDER_LAUNCH],
    )
    assert isinstance(_make_client("gemini/default"), AcpProviderClient)

    # Anything else -> OpenRouter, carrying the configured key.
    save_config(Config(openrouter_api_key="sk-or-test"))
    or_client = _make_client("z-ai/glm-4.7")
    assert isinstance(or_client, OpenRouterClient)
    assert or_client.api_key == "sk-or-test"

    # OpenRouter's org namespace collides with bare CLI names (it serves qwen/... model
    # ids); only the exact "<cli>/default" form routes to a CLI.
    assert isinstance(_make_client("qwen/qwen3-max"), OpenRouterClient)


def test_on_retry_resets_coalescer_buffer(monkeypatch) -> None:
    """A failed attempt's sub-threshold buffered tail must not survive into the retry.

    Regression test for the coalescer being shared across chat()'s internal retries:
    on_retry must clear the buffer *before* publishing the retry status event, so a
    later flush() never emits the stale prefix from the previous attempt.
    """
    published: list[dict] = []
    monkeypatch.setattr(chapters_routes.EVENT_BUS, "publish", published.append)

    on_retry, on_token, on_notice = chapters_routes._round_callbacks(1, 1, "editor")

    # Sub-threshold chunk from the failed attempt — buffered, not yet published.
    on_token("stale partial output")
    assert not any(e.get("type") == "token" for e in published)

    on_retry(1, 3)
    retry_events = [e for e in published if e.get("type") == "status" and e.get("phase") == "retry"]
    assert len(retry_events) == 1

    # The stale buffered text must be gone — a later flush publishes nothing.
    on_token.flush()
    token_events = [e for e in published if e.get("type") == "token"]
    assert token_events == []

    # New chunks after the retry behave normally (flush the buffer once non-empty).
    on_token("fresh output")
    on_token.flush()
    token_events = [e for e in published if e.get("type") == "token"]
    assert len(token_events) == 1
    assert token_events[0]["text"] == "fresh output"


def test_get_chapter_docs_after_editor_round(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value=(
        "[1]\nFR: # Chapitre 1\n\n"
        "[2]\nFR: Le matin où tout commença, il pleuvait encore.\n\n"
        "[3]\nFR: Elle pensa : « Pourquoi moi ? »\n\n"
        "[4]\nFR: La fenêtre était *froide* sous sa main.\n"
    ))
    monkeypatch.setattr(chapters_routes, "_make_client", lambda model: fake_client)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    r = client.get(f"/books/{slug}/chapter/1/docs")
    body = r.json()
    # Working doc is now the editor's output, previous is the source-translated
    assert body["working"]["paragraphs"][0]["text"] == "Chapitre 1"
    assert body["previous"] is not None
