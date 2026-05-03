"""Resolve filesystem paths under ~/.translate/.

TRANSLATE_ROOT env var overrides for tests; production reads ~/.translate/.
"""
from __future__ import annotations

import os
from pathlib import Path


def translate_root() -> Path:
    env = os.environ.get("TRANSLATE_ROOT")
    return Path(env) if env else Path.home() / ".translate"


def lock_path() -> Path:
    return translate_root() / ".lock"


def config_path() -> Path:
    return translate_root() / "config.json"


def prompts_dir() -> Path:
    return translate_root() / "prompts"


def book_dir(slug: str) -> Path:
    return translate_root() / slug
