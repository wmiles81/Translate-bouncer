from fastapi.testclient import TestClient

from server.main import create_app


def test_health_returns_ok():
    app = create_app()
    client = TestClient(app)
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
