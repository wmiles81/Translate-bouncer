"""Shared pytest fixtures for server tests."""
from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def translate_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Isolated ~/.translate/ rooted in tmp_path for one test.

    Sets the TRANSLATE_ROOT env var so server modules read/write here.
    """
    root = tmp_path / "translate"
    root.mkdir()
    monkeypatch.setenv("TRANSLATE_ROOT", str(root))
    return root


@pytest.fixture
def fixtures_dir() -> Path:
    """Path to the bundled test fixture .docx files."""
    return Path(__file__).parent / "fixtures"
