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


import httpx
import respx

from server.config import Config, save_config


@respx.mock
def test_get_models_returns_full_objects(translate_root: Path) -> None:
    save_config(Config(openrouter_api_key="sk-or-test"))
    respx.get("https://openrouter.ai/api/v1/models").mock(
        return_value=httpx.Response(200, json={"data": [
            {"id": "a", "name": "Model A", "context_length": 1000},
            {"id": "b", "name": "Model B", "context_length": 2000},
        ]})
    )
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 2
    assert body[0]["id"] == "a"
    assert body[1]["id"] == "b"
    assert body[0]["context_length"] == 1000


def test_get_models_returns_400_when_no_api_key(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 400
