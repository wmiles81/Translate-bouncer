"""Finalize a chapter by promoting the latest Editor output to final.docx."""
from __future__ import annotations

import shutil

from server.paths import book_dir
from server.state import ChapterStatus, load_book_meta, load_chapter_meta, save_book_meta, save_chapter_meta


class FinalizeError(Exception):
    pass


def finalize_chapter(*, slug: str, chapter_n: int) -> None:
    cm = load_chapter_meta(slug, n=chapter_n)
    if cm.current_round < 1:
        raise FinalizeError(
            f"chapter {chapter_n} has no completed Editor round yet"
        )
    cdir = book_dir(slug) / "chapters" / f"ch{chapter_n:02d}"
    # A completed round ends with the revised pass; fall back to the round's
    # draft when only the editor pass ran.
    src = cdir / f"round-{cm.current_round}-editor-revised.docx"
    if not src.exists():
        src = cdir / f"round-{cm.current_round}-editor.docx"
    if not src.exists():
        raise FinalizeError(f"missing {src.name}")
    shutil.copyfile(src, cdir / "final.docx")
    cm.status = ChapterStatus.DONE
    save_chapter_meta(slug, cm)
    bm = load_book_meta(slug)
    for entry in bm.chapters:
        if entry.n == chapter_n:
            entry.status = ChapterStatus.DONE
    save_book_meta(bm)
