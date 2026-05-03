from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.file_picker import UnsupportedPlatform, pick_file, pick_folder

router = APIRouter(prefix="/system")


class PickPathRequest(BaseModel):
    kind: Literal["file", "folder"]


class PickPathResponse(BaseModel):
    path: Optional[str] = None


@router.post("/pick-path", response_model=PickPathResponse)
def post_pick_path(req: PickPathRequest) -> PickPathResponse:
    try:
        path = pick_file() if req.kind == "file" else pick_folder()
    except UnsupportedPlatform as exc:
        raise HTTPException(status_code=501, detail=str(exc))
    return PickPathResponse(path=path)
