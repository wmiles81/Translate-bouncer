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


def test_restore_book_archives_edits_and_resets_state(translate_root, fixtures_dir, monkeypatch) -> None:
    """Restore returns every chapter to the original translation, archiving (not
    deleting) the rounds it had."""
    from unittest.mock import AsyncMock

    from server.routes import chapters as chapters_routes

    client = TestClient(create_app())
    slug = client.post("/books", json={
        "translated_path": str(fixtures_dir / "sample-fr-folder"),
        "english_path": str(fixtures_dir / "sample-en-folder"),
        "language_pair": {"from": "en", "to": "fr"},
    }).json()["slug"]

    fake = AsyncMock()
    fake.chat = AsyncMock(return_value=(
        "[1]\nFR: # Chapitre 1\n\n[2]\nFR: Le matin où tout commença, il pleuvait encore.\n\n"
        "[3]\nFR: Salut\n\n[4]\nFR: La main *froide*\n"
    ))
    monkeypatch.setattr(chapters_routes, "_make_client", lambda model: fake)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    cdir = translate_root / slug / "chapters" / "ch01"
    assert (cdir / "round-1-editor.json").exists()

    r = client.post(f"/books/{slug}/restore")
    assert r.status_code == 200
    assert r.json()["files_archived"] >= 1

    # Chapter is pristine again...
    state = client.get(f"/books/{slug}/chapter/1/state").json()
    assert state["current_round"] == 0
    assert state["status"] == "untouched"
    assert state["rounds"] == []
    assert not (cdir / "round-1-editor.json").exists()
    # ...but the work is archived, not gone, and the sources are untouched.
    assert (cdir / "archive-1" / "round-1-editor.json").exists()
    assert (translate_root / slug / "source-translated" / "ch01.json").exists()

    # A second restore after new edits archives into archive-2 (lower n = older).
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    client.post(f"/books/{slug}/restore")
    assert (cdir / "archive-2" / "round-1-editor.json").exists()
    assert (cdir / "archive-1" / "round-1-editor.json").exists()


def test_restore_unknown_book_is_404(translate_root) -> None:
    assert TestClient(create_app()).post("/books/nope/restore").status_code == 404
