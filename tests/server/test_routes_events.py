from __future__ import annotations

import asyncio
import json

import pytest
from fastapi.testclient import TestClient

from server.main import EVENT_BUS, create_app
from server.routes.events import events_stream


@pytest.fixture(autouse=True)
def reset_event_bus() -> None:
    """Clear all subscribers before and after each test."""
    EVENT_BUS._subscribers.clear()
    yield
    EVENT_BUS._subscribers.clear()


def test_events_route_is_registered() -> None:
    """Smoke test: verify the /events route is registered on the app."""
    app = create_app()
    routes = [route.path for route in app.routes]
    assert "/events" in routes


async def test_events_stream_emits_sse_format() -> None:
    """Direct integration test of the SSE generator.

    Subscribes via the route's StreamingResponse, publishes events, and asserts
    the SSE wire format. No TestClient/HTTP — bypasses the threading race entirely.
    """
    response = await events_stream()
    body_iter = response.body_iterator

    # Schedule publishes after the subscriber is registered.
    async def publisher():
        # Yield once so the consumer's anext can prime the subscription.
        await asyncio.sleep(0)
        EVENT_BUS.publish({"type": "status", "text": "hello"})
        EVENT_BUS.publish({"type": "stop"})

    pub_task = asyncio.create_task(publisher())
    received: list[str] = []
    async for chunk in body_iter:
        received.append(chunk if isinstance(chunk, str) else chunk.decode())
        # Stop when we see the stop event (generator also returns after this)
        if any('"type": "stop"' in c for c in received):
            break
    await pub_task

    # SSE wire format: each event is `data: {json}\n\n`
    assert any(c.startswith("data: ") for c in received)
    assert any('"text": "hello"' in c for c in received)
    assert any('"type": "stop"' in c for c in received)
