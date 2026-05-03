"""Single-instance lock under ~/.translate/.lock.

Lock file contains JSON {"pid": int, "url": str}. The url is the
URL the running server bound (e.g., "http://localhost:5180").
A second launch reads this URL, opens a browser tab there, and exits.

Stale locks (PID no longer alive) are taken over silently.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Optional, TypedDict

from server.paths import lock_path, translate_root


class LockData(TypedDict):
    pid: int
    url: str


@dataclass
class LockHeld(Exception):
    pid: int
    url: str

    def __str__(self) -> str:
        return f"Lock held by PID {self.pid} at {self.url}"


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists but not ours
    return True


def read_lock() -> Optional[LockData]:
    p = lock_path()
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except (json.JSONDecodeError, OSError):
        return None


def acquire_lock(*, url: str) -> None:
    """Acquire the lock; raise LockHeld if another live process holds it."""
    translate_root().mkdir(parents=True, exist_ok=True)
    existing = read_lock()
    if existing is not None and _pid_alive(existing["pid"]):
        raise LockHeld(pid=existing["pid"], url=existing["url"])
    lock_path().write_text(json.dumps({"pid": os.getpid(), "url": url}))


def release_lock() -> None:
    p = lock_path()
    if p.exists():
        try:
            data = json.loads(p.read_text())
            if data.get("pid") == os.getpid():
                p.unlink()
        except (json.JSONDecodeError, OSError):
            p.unlink(missing_ok=True)
