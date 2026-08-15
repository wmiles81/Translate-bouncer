"""Read and write ~/.translate/config.json with mode 600."""
from __future__ import annotations

import json
import os
from typing import List

from pydantic import BaseModel, Field

from server.paths import config_path, translate_root


class DefaultModels(BaseModel):
    editor: str = ""
    reviewer: str = ""


class IngestionConfig(BaseModel):
    heading_style: str = "Heading 1"
    fallback_patterns: List[str] = Field(
        default_factory=lambda: [
            r"^Chapter\s+\d+",
            r"^Chapitre\s+\d+",
            r"^Capítulo\s+\d+",
            r"^Chapter\s+[IVXLCM]+",
        ]
    )


class Config(BaseModel):
    # Optional: models outside the provider-CLI namespace route through OpenRouter.
    openrouter_api_key: str = ""
    default_models: DefaultModels = Field(default_factory=DefaultModels)
    ingestion: IngestionConfig = Field(default_factory=IngestionConfig)


def load_config() -> Config:
    p = config_path()
    if not p.exists():
        return Config()
    return Config.model_validate_json(p.read_text())


def save_config(cfg: Config) -> None:
    translate_root().mkdir(parents=True, exist_ok=True)
    p = config_path()
    # Write with restricted permissions from the start.
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(cfg.model_dump_json(indent=2))
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        raise
    os.chmod(str(p), 0o600)  # in case file pre-existed with looser perms
