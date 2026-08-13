from __future__ import annotations

import os
import stat
from pathlib import Path

from server.config import Config, load_config, save_config


def test_load_returns_default_when_missing(translate_root: Path) -> None:
    cfg = load_config()
    assert cfg.default_models.editor == ""
    assert cfg.default_models.reviewer == ""
    assert cfg.ingestion.heading_style == "Heading 1"
    assert cfg.ingestion.fallback_patterns  # non-empty


def test_save_writes_json_and_round_trips(translate_root: Path) -> None:
    cfg = Config(
        default_models={"editor": "claude-code/opus", "reviewer": "gemini/gemini-2.5-pro"},
    )
    save_config(cfg)
    loaded = load_config()
    assert loaded.default_models.editor == "claude-code/opus"
    assert loaded.default_models.reviewer == "gemini/gemini-2.5-pro"


def test_save_sets_mode_600(translate_root: Path) -> None:
    save_config(Config())
    p = translate_root / "config.json"
    mode = stat.S_IMODE(p.stat().st_mode)
    assert mode == 0o600, f"expected 0o600, got {oct(mode)}"


def test_load_ignores_stale_openrouter_key(translate_root: Path) -> None:
    """Configs written before the subscription switch still load cleanly."""
    p = translate_root / "config.json"
    p.write_text('{"openrouter_api_key": "sk-or-stale", "default_models": {"editor": "e", "reviewer": "r"}}')
    cfg = load_config()
    assert not hasattr(cfg, "openrouter_api_key")
    assert cfg.default_models.editor == "e"
