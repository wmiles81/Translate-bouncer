"""Tests for the translate CLI command."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

from server.lock import acquire_lock, release_lock
from server.main import cli


def test_cli_exits_quickly_when_lock_is_held(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    try:
        with patch("server.main.webbrowser.open") as opener:
            runner = CliRunner()
            result = runner.invoke(cli, ["--no-browser-on-existing"])
            assert result.exit_code == 0
            assert "already running" in result.output.lower()
            opener.assert_not_called()
    finally:
        release_lock()


def test_cli_opens_browser_to_existing_url_by_default(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    try:
        with patch("server.main.webbrowser.open") as opener:
            runner = CliRunner()
            result = runner.invoke(cli, [])
            assert result.exit_code == 0
            opener.assert_called_once_with("http://localhost:5180")
    finally:
        release_lock()
