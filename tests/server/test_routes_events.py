from __future__ import annotations

import json
import threading
import time

from fastapi.testclient import TestClient

from server.main import EVENT_BUS, create_app


def test_sse_stream_delivers_published_event() -> None:
    client = TestClient(create_app())

    # Publish events in a background thread to ensure they arrive while generator is waiting
    def publish_events():
        # Wait a tiny amount for generator to enter the wait state
        time.sleep(0.01)
        EVENT_BUS.publish({"type": "status", "text": "hello"})
        EVENT_BUS.publish({"type": "stop"})

    thread = threading.Thread(target=publish_events, daemon=True)
    thread.start()

    with client.stream("GET", "/events") as r:
        assert r.status_code == 200
        lines: list[str] = []
        for raw in r.iter_lines():
            if raw:
                lines.append(raw)
            if any('"type": "stop"' in l for l in lines):
                break
        # SSE format prefix `data: `
        assert any('"text": "hello"' in l for l in lines)

    thread.join(timeout=2)
