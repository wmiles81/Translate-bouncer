from __future__ import annotations

import os
import stat
from pathlib import Path

from server.config import Config, load_config, save_config


def test_load_returns_default_when_missing(translate_root: Path) -> None:
    cfg = load_config()
    assert cfg.openrouter_api_key == ""
    assert cfg.default_models.editor == ""
    assert cfg.default_models.reviewer == ""
    assert cfg.ingestion.heading_style == "Heading 1"
    assert cfg.ingestion.fallback_patterns  # non-empty


def test_save_writes_json_and_round_trips(translate_root: Path) -> None:
    cfg = Config(
        openrouter_api_key="sk-or-test",
        default_models={"editor": "anthropic/claude-sonnet-4", "reviewer": "openai/gpt-5"},
    )
    save_config(cfg)
    loaded = load_config()
    assert loaded.openrouter_api_key == "sk-or-test"
    assert loaded.default_models.editor == "anthropic/claude-sonnet-4"
    assert loaded.default_models.reviewer == "openai/gpt-5"


def test_save_sets_mode_600(translate_root: Path) -> None:
    save_config(Config(openrouter_api_key="x"))
    p = translate_root / "config.json"
    mode = stat.S_IMODE(p.stat().st_mode)
    assert mode == 0o600, f"expected 0o600, got {oct(mode)}"
