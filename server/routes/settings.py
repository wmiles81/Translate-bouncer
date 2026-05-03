from fastapi import APIRouter, HTTPException

from server.config import Config, load_config, save_config
from server.errors import ConfigurationError, TransientError
from server.openrouter import OpenRouterClient

router = APIRouter()


@router.get("/settings", response_model=Config)
def get_settings() -> Config:
    return load_config()


@router.put("/settings", response_model=Config)
def put_settings(cfg: Config) -> Config:
    save_config(cfg)
    return load_config()


@router.get("/models")
async def get_models() -> list[str]:
    cfg = load_config()
    if not cfg.openrouter_api_key:
        raise HTTPException(status_code=400, detail="OpenRouter API key not configured")
    client = OpenRouterClient(api_key=cfg.openrouter_api_key)
    try:
        return await client.list_models()
    except (ConfigurationError, TransientError) as exc:
        raise HTTPException(status_code=502, detail=str(exc))
