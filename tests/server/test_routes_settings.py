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
        "default_models": {"editor": "claude-code/default", "reviewer": "z-ai/glm-4.7"},
    })
    assert r.status_code == 200
    r2 = client.get("/settings")
    assert r2.json()["openrouter_api_key"] == "sk-or-test"
    assert r2.json()["default_models"]["editor"] == "claude-code/default"


def test_get_models_lists_detected_clis_without_a_key(translate_root: Path, monkeypatch) -> None:
    # No API key, no network: /models serves one "default" entry per DETECTED CLI.
    # No named per-provider models — the adapters can't actually switch models.
    import server.acp_providers as ap
    import server.routes.settings as settings_routes  # noqa: F401 - route reads ap live

    monkeypatch.setattr(
        ap, "detect_providers",
        lambda: [{"id": pid, "name": ap._PROVIDER_NAMES[pid], "detected": pid != "qwen"}
                 for pid in ap.PROVIDER_LAUNCH],
    )
    from pathlib import Path
    monkeypatch.setattr(ap, "_codex_models_cache_path", lambda: Path("/nonexistent/mc.json"))
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 200
    body = r.json()
    ids = {m["id"] for m in body}
    assert ids == {"claude-code/default", "codex/default", "gemini/default"}
    for m in body:
        assert m["pricing"] == {"prompt": "0", "completion": "0"}


def test_get_models_merges_openrouter_when_key_set(translate_root: Path, monkeypatch) -> None:
    import server.acp_providers as ap
    from server.config import Config, save_config
    from server.openrouter import OpenRouterClient

    save_config(Config(openrouter_api_key="sk-or-test"))
    monkeypatch.setattr(
        ap, "detect_providers",
        lambda: [{"id": pid, "name": ap._PROVIDER_NAMES[pid], "detected": pid == "gemini"}
                 for pid in ap.PROVIDER_LAUNCH],
    )

    async def fake_list_models(self):
        return [{"id": "deepseek/deepseek-v4-pro", "name": "DeepSeek V4 Pro",
                 "pricing": {"prompt": "0.000001", "completion": "0.000002"}}]

    monkeypatch.setattr(OpenRouterClient, "list_models", fake_list_models)
    client = TestClient(create_app())
    ids = {m["id"] for m in client.get("/models").json()}
    assert ids == {"gemini/default", "deepseek/deepseek-v4-pro"}


def test_get_models_survives_openrouter_fetch_failure(translate_root: Path, monkeypatch) -> None:
    import server.acp_providers as ap
    from server.config import Config, save_config
    from server.openrouter import OpenRouterClient

    save_config(Config(openrouter_api_key="sk-or-bad"))
    monkeypatch.setattr(
        ap, "detect_providers",
        lambda: [{"id": pid, "name": ap._PROVIDER_NAMES[pid], "detected": pid == "gemini"}
                 for pid in ap.PROVIDER_LAUNCH],
    )

    async def failing_list_models(self):
        raise RuntimeError("network down")

    monkeypatch.setattr(OpenRouterClient, "list_models", failing_list_models)
    client = TestClient(create_app())
    r = client.get("/models")
    assert r.status_code == 200
    assert {m["id"] for m in r.json()} == {"gemini/default"}


def test_get_providers_reports_detection(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/providers")
    assert r.status_code == 200
    body = r.json()
    ids = {p["id"] for p in body}
    assert {"claude-code", "codex", "gemini", "qwen"} <= ids
    for p in body:
        assert isinstance(p["detected"], bool)
