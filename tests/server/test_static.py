from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_root_serves_index_when_dist_exists(tmp_path: Path, monkeypatch) -> None:
    # Simulate a built client.
    dist = tmp_path / "client_dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>built</body></html>")
    monkeypatch.setenv("TRANSLATE_CLIENT_DIST", str(dist))

    client = TestClient(create_app())
    r = client.get("/")
    assert r.status_code == 200
    assert "built" in r.text


def test_root_returns_404_when_dist_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TRANSLATE_CLIENT_DIST", str(tmp_path / "nope"))
    client = TestClient(create_app())
    r = client.get("/")
    # No client built; root has no handler.
    assert r.status_code == 404


def test_api_routes_still_work_when_dist_mounted(tmp_path: Path, monkeypatch) -> None:
    dist = tmp_path / "client_dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>built</body></html>")
    monkeypatch.setenv("TRANSLATE_CLIENT_DIST", str(dist))

    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
