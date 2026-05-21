from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_get_settings_returns_defaults_when_unset(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/settings")
    assert r.status_code == 200
    assert r.json()["openrouter_api_key"] == ""


def test_put_settings_persists(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.put("/settings", json={
        "openrouter_api_key": "sk-or-test",
        "default_models": {"editor": "anthropic/claude-sonnet-4", "reviewer": "openai/gpt-5"},
    })
    assert r.status_code == 200
    r2 = client.get("/settings")
    assert r2.json()["openrouter_api_key"] == "sk-or-test"
    assert r2.json()["default_models"]["editor"] == "anthropic/claude-sonnet-4"


def test_get_models_returns_cli_catalog(translate_root: Path) -> None:
    # No API key, no network: /models serves the static CLI-routable catalog.
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 200
    body = r.json()
    assert len(body) > 0
    ids = {m["id"] for m in body}
    assert "gemini/gemini-2.5-pro" in ids
    # Every model is $0 (covered by the subscription) and OpenRouter-shaped.
    for m in body:
        assert "/" in m["id"]
        assert m["pricing"] == {"prompt": "0", "completion": "0"}


def test_get_providers_reports_detection(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/providers")
    assert r.status_code == 200
    body = r.json()
    ids = {p["id"] for p in body}
    assert {"claude-code", "codex", "gemini", "qwen"} <= ids
    for p in body:
        assert isinstance(p["detected"], bool)
