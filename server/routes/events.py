from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

router = APIRouter()


@router.get("/events")
async def events_stream():
    from server.main import EVENT_BUS

    async def gen():
        async for evt in EVENT_BUS.subscribe(timeout=60.0):
            yield f"data: {json.dumps(evt)}\n\n"
            if evt.get("type") == "stop":
                return

    return StreamingResponse(gen(), media_type="text/event-stream")
