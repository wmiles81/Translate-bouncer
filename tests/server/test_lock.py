from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from server.lock import LockHeld, acquire_lock, read_lock, release_lock


def test_acquire_writes_pid_and_url(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    data = read_lock()
    assert data is not None
    assert data["pid"] == os.getpid()
    assert data["url"] == "http://localhost:5180"
    release_lock()


def test_release_removes_lock_file(translate_root: Path) -> None:
    acquire_lock(url="http://localhost:5180")
    release_lock()
    assert read_lock() is None


def test_acquire_when_held_by_live_pid_raises_lockheld(translate_root: Path) -> None:
    # Simulate another live process holding the lock by writing this PID.
    (translate_root / ".lock").write_text(
        json.dumps({"pid": os.getpid(), "url": "http://localhost:5180"})
    )
    with pytest.raises(LockHeld) as exc:
        acquire_lock(url="http://localhost:5181")
    assert exc.value.url == "http://localhost:5180"
    assert exc.value.pid == os.getpid()


def test_acquire_takes_over_stale_lock(translate_root: Path) -> None:
    # PID 1 should always be alive, but PID 2**31-1 is essentially never live.
    dead_pid = 2**31 - 1
    (translate_root / ".lock").write_text(
        json.dumps({"pid": dead_pid, "url": "http://localhost:5180"})
    )
    acquire_lock(url="http://localhost:5181")
    data = read_lock()
    assert data["pid"] == os.getpid()
    assert data["url"] == "http://localhost:5181"
    release_lock()


def test_read_lock_missing_returns_none(translate_root: Path) -> None:
    assert read_lock() is None
