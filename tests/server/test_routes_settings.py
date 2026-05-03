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
