from fastapi import APIRouter

from server.config import Config, load_config, save_config

router = APIRouter()


@router.get("/settings", response_model=Config)
def get_settings() -> Config:
    return load_config()


@router.put("/settings", response_model=Config)
def put_settings(cfg: Config) -> Config:
    save_config(cfg)
    return load_config()
