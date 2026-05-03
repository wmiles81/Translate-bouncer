from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.config import load_config
from server.ingest import ChapterCountMismatch, ingest_book
from server.state import LanguagePair, list_books, load_book_meta

router = APIRouter()


class IngestRequest(BaseModel):
    translated_path: str
    english_path: str
    language_pair: LanguagePair


class IngestResponse(BaseModel):
    slug: str


@router.get("/books", response_model=List[str])
def get_books() -> List[str]:
    return list_books()


@router.post("/books", response_model=IngestResponse)
def post_book(req: IngestRequest) -> IngestResponse:
    cfg = load_config()
    from pathlib import Path
    try:
        result = ingest_book(
            translated_path=Path(req.translated_path),
            english_path=Path(req.english_path),
            language_pair=(req.language_pair.from_, req.language_pair.to),
            ingestion=cfg.ingestion,
        )
    except ChapterCountMismatch as exc:
        raise HTTPException(status_code=409, detail={
            "message": str(exc),
            "en_count": exc.en_count,
            "tr_count": exc.tr_count,
            "en_titles": exc.en_titles,
            "tr_titles": exc.tr_titles,
        })
    return IngestResponse(slug=result.slug)


@router.get("/books/{slug}")
def get_book(slug: str) -> dict:
    try:
        return load_book_meta(slug).model_dump(by_alias=True)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
