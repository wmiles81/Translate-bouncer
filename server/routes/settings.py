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
    # CLI-routable models in the catalog's model-object shape, with $0 pricing (the
    # user's subscription covers usage).
    return model_catalog()


@router.get("/providers")
def get_providers() -> list[dict]:
    """Which provider CLIs are installed on this machine (for the Settings status)."""
    return detect_providers()
