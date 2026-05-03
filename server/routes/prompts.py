from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.prompts import (
    PromptKind,
    delete_version,
    load_prompts,
    restore_version,
    save_new_version,
)

router = APIRouter(prefix="/prompts")


class PromptUpdate(BaseModel):
    text: str


def _kind(kind: str) -> PromptKind:
    try:
        return PromptKind(kind)
    except ValueError:
        raise HTTPException(status_code=404, detail=f"unknown prompt kind: {kind}")


@router.get("/{kind}")
def get_prompts(kind: str) -> dict:
    return load_prompts(_kind(kind)).model_dump()


@router.put("/{kind}")
def put_prompts(kind: str, update: PromptUpdate) -> dict:
    save_new_version(_kind(kind), update.text)
    return load_prompts(_kind(kind)).model_dump()


@router.post("/{kind}/restore/{version_id}")
def post_restore(kind: str, version_id: str) -> dict:
    try:
        restore_version(_kind(kind), version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return load_prompts(_kind(kind)).model_dump()


@router.delete("/{kind}/{version_id}")
def delete_v(kind: str, version_id: str) -> dict:
    try:
        delete_version(_kind(kind), version_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return load_prompts(_kind(kind)).model_dump()
