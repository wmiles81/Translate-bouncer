from fastapi import APIRouter

from server.acp_providers import detect_providers, model_catalog
from server.config import Config, load_config, save_config

router = APIRouter()


@router.get("/settings", response_model=Config)
def get_settings() -> Config:
    return load_config()


@router.put("/settings", response_model=Config)
def put_settings(cfg: Config) -> Config:
    save_config(cfg)
    return load_config()


@router.get("/models")
async def get_models() -> list[dict]:
    # Detected provider CLIs (one "default" entry each, $0 — the subscription covers
    # usage), plus the live OpenRouter list when an API key is configured.
    models = model_catalog()
    cfg = load_config()
    if cfg.openrouter_api_key:
        from server.openrouter import OpenRouterClient

        try:
            models += await OpenRouterClient(api_key=cfg.openrouter_api_key).list_models()
        except Exception:  # noqa: BLE001 - CLI entries still work without the list
            pass
    return models


@router.get("/providers")
def get_providers() -> list[dict]:
    """Which provider CLIs are installed on this machine (for the Settings status)."""
    return detect_providers()
