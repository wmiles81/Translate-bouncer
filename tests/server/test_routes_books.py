from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_get_books_empty(translate_root: Path) -> None:
    client = TestClient(create_app())
    r = client.get("/books")
    assert r.status_code == 200
    assert r.json() == []


def test_post_book_ingests_and_lists(translate_root: Path, fixtures_dir: Path) -> None:
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    assert r.status_code == 200
    slug = r.json()["slug"]
    list_r = client.get("/books")
    assert slug in list_r.json()


def test_post_book_returns_409_on_chapter_count_mismatch(
    translate_root: Path, fixtures_dir: Path, tmp_path: Path
) -> None:
    short = tmp_path / "short-en"
    short.mkdir()
    src = sorted((fixtures_dir / "sample-en-folder").iterdir())[:2]
    for f in src:
        (short / f.name).write_bytes(f.read_bytes())
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(short),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    assert r.status_code == 409
    body = r.json()
    assert body["detail"]["en_count"] == 2
    assert body["detail"]["tr_count"] == 3


def test_get_book_state_returns_meta(translate_root: Path, fixtures_dir: Path) -> None:
    client = TestClient(create_app())
    r = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug = r.json()["slug"]
    state = client.get(f"/books/{slug}").json()
    assert state["slug"] == slug
    assert len(state["chapters"]) == 3
