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


def test_post_book_with_on_collision_resume(translate_root: Path, fixtures_dir: Path) -> None:
    client = TestClient(create_app())
    # First ingest
    r1 = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug1 = r1.json()["slug"]
    # Second ingest with on_collision="resume" reuses the same slug
    r2 = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
        "on_collision":    "resume",
    })
    assert r2.status_code == 200
    assert r2.json()["slug"] == slug1


def test_post_book_default_on_collision_is_new_session(translate_root: Path, fixtures_dir: Path) -> None:
    client = TestClient(create_app())
    r1 = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug1 = r1.json()["slug"]
    r2 = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path":    str(fixtures_dir / "sample-en-folder"),
        "language_pair":   {"from": "en", "to": "fr"},
    })
    slug2 = r2.json()["slug"]
    assert slug2 != slug1
    assert slug2.endswith("-2")


def test_remove_book_hides_it_but_keeps_every_file(translate_root, fixtures_dir) -> None:
    """Removal is list-only: the book disappears from /books, nothing is deleted."""
    client = TestClient(create_app())
    slug = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path": str(fixtures_dir / "sample-en-folder"),
        "language_pair": {"from": "en", "to": "fr"},
    }).json()["slug"]
    assert slug in client.get("/books").json()
    before = sorted(p.name for p in (translate_root / slug).iterdir())

    r = client.delete(f"/books/{slug}")
    assert r.status_code == 200
    assert r.json()["removed"] is True

    assert slug not in client.get("/books").json()          # gone from the list
    assert (translate_root / slug).exists()                  # but still on disk
    assert sorted(p.name for p in (translate_root / slug).iterdir()) == before
    assert client.get(f"/books/{slug}").status_code == 200   # still reachable directly


def test_remove_unknown_book_is_404(translate_root) -> None:
    assert TestClient(create_app()).delete("/books/no-such-book").status_code == 404
