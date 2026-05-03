from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_get_prompts_returns_seeded_v1(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/prompts/editor")
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == "v1"
    assert len(body["versions"]) == 1


def test_put_prompts_creates_new_version(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.put("/prompts/editor", json={"text": "Edited."})
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == "v2"
    assert body["versions"][-1]["text"] == "Edited."


def test_post_restore_creates_new_entry(translate_root: Path) -> None:
    client = TestClient(create_app())
    client.put("/prompts/editor", json={"text": "v2"})  # creates v2
    r = client.post("/prompts/editor/restore/v1")
    assert r.status_code == 200
    body = r.json()
    assert body["current"] == "v3"
    # v3's text equals v1's text.
    assert body["versions"][-1]["text"] == body["versions"][0]["text"]


def test_delete_historical_version(translate_root: Path) -> None:
    client = TestClient(create_app())
    client.put("/prompts/editor", json={"text": "v2"})
    r = client.delete("/prompts/editor/v1")
    assert r.status_code == 200
    body = r.json()
    assert [v["id"] for v in body["versions"]] == ["v2"]


def test_delete_current_version_returns_400(translate_root: Path) -> None:
    client = TestClient(create_app())
    client.put("/prompts/editor", json={"text": "v2"})
    r = client.delete("/prompts/editor/v2")
    assert r.status_code == 400


def test_unknown_kind_returns_404(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/prompts/foo")
    assert r.status_code == 404
