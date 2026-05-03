"""Derive a filesystem-safe slug from a filename or folder name."""
from __future__ import annotations

import re
from pathlib import Path

_ILLEGAL = re.compile(r"[/\\:*?\"<>|]")
_SEP_RUN = re.compile(r"[\s_\-]+")
_KEEP = re.compile(r"[^\w\-]", re.UNICODE)


def derive_slug(name: str) -> str:
    """Return a filesystem-safe slug for use as a book directory name.

    - Takes the basename if a path is passed.
    - Strips file extension.
    - Lowercases.
    - Removes illegal filesystem characters.
    - Collapses runs of whitespace/underscore/hyphen into single hyphen.
    - Returns "book" if input would otherwise be empty.
    """
    # Handle path input by extracting basename (only for absolute paths)
    if name and name.startswith("/"):
        stem = Path(name).name
    else:
        stem = name

    # Remove extension if present (manual to avoid Path treating embedded "/" as path sep)
    if "." in stem:
        stem = stem.rsplit(".", 1)[0]

    # Lowercase
    stem = stem.lower()

    # Remove illegal filesystem characters
    stem = _ILLEGAL.sub("", stem)

    # Collapse runs of whitespace/underscore/hyphen into single hyphen
    stem = _SEP_RUN.sub("-", stem)

    # Remove anything still non-word/non-hyphen (handles unicode boundary)
    stem = _KEEP.sub("", stem)

    # Strip leading/trailing hyphens
    stem = stem.strip("-")

    return stem or "book"
