from typing import List, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.config import load_config
from server.ingest import ChapterCountMismatch, ingest_book
from server.paths import book_dir
from server.state import LanguagePair, list_books, load_book_meta, save_book_meta

router = APIRouter()


class IngestRequest(BaseModel):
    translated_path: str
    english_path: str
    language_pair: LanguagePair
    on_collision: Literal["resume", "new-session"] = "new-session"


class IngestResponse(BaseModel):
    slug: str


@router.get("/books", response_model=List[str])
def get_books() -> List[str]:
    return list_books()


@router.delete("/books/{slug}")
def remove_book(slug: str) -> dict:
    """Remove a book from the app's list. Files are left untouched on disk.

    Nothing is deleted: the book's folder (rounds, finals, sources) stays under
    ~/.translate/<slug>/, and clearing "hidden" in its meta.json restores it.
    """
    try:
        bm = load_book_meta(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
    bm.hidden = True
    save_book_meta(bm)
    return {"slug": slug, "removed": True, "files_kept_at": str(book_dir(slug))}


def _clean_path(s: str) -> str:
    """Strip surrounding whitespace and matching wrapping quotes from a path string."""
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        s = s[1:-1].strip()
    return s


@router.post("/books", response_model=IngestResponse)
def post_book(req: IngestRequest) -> IngestResponse:
    cfg = load_config()
    from pathlib import Path
    translated_path = Path(_clean_path(req.translated_path))
    english_path = Path(_clean_path(req.english_path))
    try:
        result = ingest_book(
            translated_path=translated_path,
            english_path=english_path,
            language_pair=(req.language_pair.from_, req.language_pair.to),
            ingestion=cfg.ingestion,
            on_collision=req.on_collision,
        )
    except ChapterCountMismatch as exc:
        raise HTTPException(status_code=409, detail={
            "message": str(exc),
            "en_count": exc.en_count,
            "tr_count": exc.tr_count,
            "en_titles": exc.en_titles,
            "tr_titles": exc.tr_titles,
        })
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=f"path not found: {exc}")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return IngestResponse(slug=result.slug)


@router.get("/books/{slug}")
def get_book(slug: str) -> dict:
    try:
        return load_book_meta(slug).model_dump(by_alias=True)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
