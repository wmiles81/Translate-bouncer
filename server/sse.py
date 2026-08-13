"""In-process pub/sub for streaming round progress to SSE subscribers."""
from __future__ import annotations

import asyncio
from typing import AsyncIterator, Set


class EventBus:
    def __init__(self) -> None:
        self._subscribers: Set[asyncio.Queue] = set()

    def publish(self, event: dict) -> None:
        for q in list(self._subscribers):
            while True:
                try:
                    q.put_nowait(event)
                    break
                except asyncio.QueueFull:
                    # Slow consumer: drop the oldest event rather than grow unboundedly.
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass

    async def subscribe(self, *, timeout: float | None = None) -> AsyncIterator[dict]:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subscribers.add(q)
        try:
            while True:
                if timeout is None:
                    evt = await q.get()
                else:
                    try:
                        evt = await asyncio.wait_for(q.get(), timeout=timeout)
                    except asyncio.TimeoutError:
                        return
                yield evt
        finally:
            self._subscribers.discard(q)
