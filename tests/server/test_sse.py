from __future__ import annotations

import asyncio

import pytest

from server.sse import EventBus


async def test_publish_then_subscribe_delivers_event() -> None:
    bus = EventBus()
    received: list[dict] = []

    async def consume():
        async for evt in bus.subscribe(timeout=0.5):
            received.append(evt)
            if evt["type"] == "stop":
                break

    task = asyncio.create_task(consume())
    await asyncio.sleep(0)  # let consumer enter the loop
    bus.publish({"type": "status", "text": "Round 1 — calling Editor..."})
    bus.publish({"type": "stop"})
    await task
    assert received[0]["text"].startswith("Round 1")
    assert received[-1]["type"] == "stop"


async def test_multiple_subscribers_each_get_events() -> None:
    bus = EventBus()
    a: list[dict] = []
    b: list[dict] = []

    async def consume(target: list[dict]):
        async for evt in bus.subscribe(timeout=0.3):
            target.append(evt)
            if evt.get("type") == "stop":
                break

    ta = asyncio.create_task(consume(a))
    tb = asyncio.create_task(consume(b))
    await asyncio.sleep(0)
    bus.publish({"type": "status", "text": "x"})
    bus.publish({"type": "stop"})
    await asyncio.gather(ta, tb)
    assert len(a) == len(b) == 2
