# ACP Provider Path Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 10 confirmed review findings in the ACP subscription-routing path and remove the dead OpenRouter path, per [docs/specs/2026-08-13-acp-repair-spec.md](../../specs/2026-08-13-acp-repair-spec.md).

**Architecture:** `server/acp_providers.py` gains per-connection lifecycle (own `AsyncExitStack`), per-provider spawn locks, timeouts on every awaited connection op, session-id-filtered streaming, and typed error classification. Routes gain provider-specific preflight and coalesced token events. The OpenRouter client, config key, and UI remnants are deleted. Client fixes are surgical (stream filtering, diff memoization, hook consolidation).

**Tech Stack:** Python 3.11 / FastAPI / pytest (server, run via `.venv/bin/python -m pytest`), React 18 + TypeScript / vitest (client, run via `cd client && npm test`). ACP SDK `acp` 0.10.x (`ClientSideConnection` has `initialize`, `new_session`, `set_session_model`, `prompt`, `close_session`, `cancel`; `spawn_agent_process` is an `@asynccontextmanager` yielding `(connection, proc)` whose exit terminates the subprocess).

## Global Constraints

- Server tests: `.venv/bin/python -m pytest tests/server -q` from the repo root. Client tests: `cd client && npm test`. Both must pass after every task.
- Timeout constants (exact values from the spec): `PROMPT_TIMEOUT = 600.0`, `SPAWN_TIMEOUT = 120.0`, `SESSION_TIMEOUT = 60.0`, cancel cap `5.0`, discard-close cap `10.0`.
- Token coalescing threshold: `300` chars. SSE queue bound: `maxsize=1000`, drop-oldest.
- Git-tracked **source** files are edited in place (repo precedent; git history is the version record). **Documentation** files follow the side-by-side versioning convention: never modify `USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER.md` or `_v2.md`; a revision is a new `_v3.md`.
- Never delete or modify `*.annotations.json` files (none exist today; re-check with `find . -name "*.annotations.json"` before starting).
- Commit after every task with a conventional-commit message ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Match existing code style: type hints, `from __future__ import annotations`, terse docstrings, `# noqa: BLE001` on intentional broad excepts.

---

### Task 1: Error classification (R3)

**Files:**
- Modify: `server/acp_providers.py:84-100` (`_CONFIG_ERROR_HINTS`), `server/acp_providers.py:151-160` (`_classify`)
- Modify: `server/errors.py:1-7` (docstring only)
- Test: `tests/server/test_acp_providers.py:115-122`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_classify(exc: Exception) -> Exception` with the new policy; later tasks rely on `FileNotFoundError → ConfigurationError` and `rate limit → TransientError`.

- [ ] **Step 1: Replace the classification test with the new policy (failing first)**

In `tests/server/test_acp_providers.py`, replace `test_classify_maps_auth_and_usage_to_configuration` (lines 115–122) with:

```python
def test_classify_policy() -> None:
    from server.acp_providers import _classify

    # User-must-act -> ConfigurationError.
    assert isinstance(_classify(Exception("Please sign in to continue")), ConfigurationError)
    assert isinstance(_classify(Exception("usage limit reached")), ConfigurationError)
    exc = _classify(FileNotFoundError(2, "No such file or directory", "npx"))
    assert isinstance(exc, ConfigurationError)
    assert "npx" in str(exc)
    # Retryable -> TransientError (rate limits clear on their own; "not found"
    # phrasing appears in transient agent errors like "session not found").
    assert isinstance(_classify(Exception("rate limit exceeded")), TransientError)
    assert isinstance(_classify(Exception("quota exceeded, retry later")), TransientError)
    assert isinstance(_classify(Exception("session not found")), TransientError)
    assert isinstance(_classify(Exception("connection reset by peer")), TransientError)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python -m pytest tests/server/test_acp_providers.py::test_classify_policy -v`
Expected: FAIL — `rate limit exceeded` currently classifies as `ConfigurationError`.

- [ ] **Step 3: Implement the new policy**

In `server/acp_providers.py`, replace `_CONFIG_ERROR_HINTS` (lines 84–100) with:

```python
# Substrings that mean "the user must act; retrying won't help" -> ConfigurationError.
# Rate limits and quotas are NOT here: they clear on their own, so they stay retryable
# (TransientError), matching server/errors.py. Missing executables are detected by
# exception type in _classify, not by substring.
_CONFIG_ERROR_HINTS = (
    "auth",
    "login",
    "log in",
    "sign in",
    "signed in",
    "credential",
    "unauthorized",
    "usage limit",
    "upgrade to",
    "out of credits",
)
```

Replace `_classify` (lines 151–160) with:

```python
def _classify(exc: Exception) -> Exception:
    """Map a raw ACP/transport error to a TransientError or ConfigurationError."""
    if isinstance(exc, FileNotFoundError):
        missing = exc.filename or str(exc)
        return ConfigurationError(
            f"executable not found: {missing} — install the provider CLI (see the setup guide)"
        )
    msg = str(exc)
    low = msg.lower()
    if isinstance(exc, RequestError) and getattr(exc, "code", None) == -32000:
        # auth_required convention in many ACP agents
        return ConfigurationError(msg or "agent requires sign-in")
    if any(h in low for h in _CONFIG_ERROR_HINTS):
        return ConfigurationError(msg)
    return TransientError(msg or type(exc).__name__)
```

In `server/errors.py`, change line 4 from `- TransientError -> retried with backoff in OpenRouter calls` to `- TransientError -> retried with backoff in provider calls`.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/acp_providers.py server/errors.py tests/server/test_acp_providers.py
git commit -m "fix: classify rate limits as transient, missing executables as configuration errors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Detection matches launch (R4)

**Files:**
- Modify: `server/acp_providers.py:61-68` (`_DETECT_CMD`), `server/acp_providers.py:117-126` (`detect_providers`), `server/acp_providers.py:226` (executable resolution in `_spawn`)
- Test: `tests/server/test_acp_providers.py`

**Interfaces:**
- Consumes: `_subprocess_env()` (exists at `server/acp_providers.py:129`).
- Produces: `detect_providers() -> list[dict]` same shape (`{"id", "name", "detected"}`); `_REQUIRED_BINARIES: dict[str, tuple[str, ...]]` used by tests.

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/test_acp_providers.py`:

```python
def test_detection_probes_the_spawn_path_and_all_required_binaries(monkeypatch, tmp_path) -> None:
    """Detection must use the augmented PATH _spawn uses, and require every binary
    a launch needs (claude-code needs BOTH `claude` and `npx`)."""
    import server.acp_providers as ap

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    for name in ("claude", "gemini"):  # note: no npx, no codex, no qwen
        f = fake_bin / name
        f.write_text("#!/bin/sh\n")
        f.chmod(0o755)

    # Empty ambient PATH; the augmented env is the only way to find the CLIs.
    monkeypatch.setenv("PATH", str(tmp_path / "nowhere"))
    monkeypatch.setattr(ap, "_subprocess_env", lambda: {"PATH": str(fake_bin)})

    detected = {p["id"]: p["detected"] for p in ap.detect_providers()}
    assert detected["gemini"] is True          # gemini needs only `gemini`
    assert detected["claude-code"] is False    # has `claude` but not `npx`
    assert detected["codex"] is False
    assert detected["qwen"] is False
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_acp_providers.py::test_detection_probes_the_spawn_path_and_all_required_binaries -v`
Expected: FAIL — current detection uses ambient PATH and only the base CLI (claude-code reports detected).

- [ ] **Step 3: Implement**

In `server/acp_providers.py`, replace the `_DETECT_CMD` block (lines 61–68) with:

```python
# Binaries a provider's LAUNCH actually needs, resolved against the same augmented
# PATH _spawn uses. Claude/Codex launch via `npx <adapter>` and the adapter drives
# the base CLI, so both must be present.
_REQUIRED_BINARIES: dict[str, tuple[str, ...]] = {
    "claude-code": ("claude", "npx"),
    "codex": ("codex", "npx"),
    "gemini": ("gemini",),
    "qwen": ("qwen",),
}
```

Replace `detect_providers` (lines 117–126) with:

```python
def detect_providers() -> list[dict]:
    """Detect which provider CLIs are launchable, probing the PATH _spawn will use."""
    path = _subprocess_env().get("PATH")
    return [
        {
            "id": pid,
            "name": _PROVIDER_NAMES[pid],
            "detected": all(
                shutil.which(b, path=path) is not None for b in _REQUIRED_BINARIES[pid]
            ),
        }
        for pid in PROVIDER_LAUNCH
    ]
```

In `_spawn` (line 225–226), change:

```python
        cmd, args = PROVIDER_LAUNCH[provider]
        executable = shutil.which(cmd) or cmd
```

to:

```python
        cmd, args = PROVIDER_LAUNCH[provider]
        env = _subprocess_env()
        executable = shutil.which(cmd, path=env.get("PATH")) or cmd
```

and change the `spawn_agent_process(...)` call's `env=_subprocess_env()` to `env=env`.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS (`test_detect_providers_lists_all_four` still passes — shape unchanged).

- [ ] **Step 5: Commit**

```bash
git add server/acp_providers.py tests/server/test_acp_providers.py
git commit -m "fix: detect providers against the spawn PATH and all required binaries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Per-connection lifecycle + per-provider locks + spawn/session timeouts (R2, R10)

**Files:**
- Modify: `server/acp_providers.py:42-43` (constants), `:190-237` (`_Conn`, `AcpConnectionManager.__init__/get/_spawn`), `:297-299` (`aclose`)
- Test: `tests/server/test_acp_providers.py`

**Interfaces:**
- Consumes: `spawn_agent_process` (async CM from `acp`), `_classify` (Task 1).
- Produces:
  - `_Conn(connection, proc, client, lock, stack: AsyncExitStack)` — dataclass gains `stack`.
  - `AcpConnectionManager._discard(provider: str, conn: _Conn) -> None` (async) — kill + close + pop; Task 4 calls it on prompt timeout.
  - `self._spawn_locks: dict[str, asyncio.Lock]` (one per provider id).
  - Constants `SPAWN_TIMEOUT = 120.0`, `SESSION_TIMEOUT = 60.0` (module level, next to `PROMPT_TIMEOUT`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/test_acp_providers.py`:

```python
import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import server.acp_providers as ap
from server.acp_providers import AcpConnectionManager


class _FakeAcpConnection:
    """Stands in for acp's ClientSideConnection."""

    def __init__(self, *, init_exc: Exception | None = None, init_hang: bool = False):
        self.init_exc = init_exc
        self.init_hang = init_hang
        self.cancelled: list[str] = []
        self.closed_sessions: list[str] = []

    async def initialize(self, **kw):
        if self.init_hang:
            await asyncio.sleep(3600)
        if self.init_exc is not None:
            raise self.init_exc

    async def new_session(self, **kw):
        return SimpleNamespace(session_id="sid-1", models=None)

    async def set_session_model(self, **kw):
        pass

    async def prompt(self, **kw):
        pass

    async def cancel(self, **kw):
        self.cancelled.append(kw.get("session_id"))

    async def close_session(self, **kw):
        self.closed_sessions.append(kw.get("session_id"))


def _fake_spawn(connections: list[_FakeAcpConnection], procs: list) -> object:
    """Build a spawn_agent_process replacement that records kill() via proc.returncode."""

    @asynccontextmanager
    async def spawn(client, executable, *args, env=None):
        conn = connections.pop(0)
        proc = SimpleNamespace(returncode=None)
        proc.kill = lambda: setattr(proc, "returncode", -9)
        procs.append(proc)
        try:
            yield conn, proc
        finally:
            proc.kill()  # mirrors real behavior: CM exit terminates the subprocess

    return spawn


async def test_failed_initialize_terminates_the_spawned_process(monkeypatch) -> None:
    procs: list = []
    monkeypatch.setattr(
        ap, "spawn_agent_process",
        _fake_spawn([_FakeAcpConnection(init_exc=Exception("boom"))], procs),
    )
    mgr = AcpConnectionManager()
    with pytest.raises(TransientError):
        await mgr.get("gemini")
    assert procs[0].returncode is not None, "orphaned agent process after failed initialize"
    assert "gemini" not in mgr._conns
    await mgr.aclose()


async def test_hung_initialize_times_out_and_does_not_block_other_providers(monkeypatch) -> None:
    procs: list = []
    hung = _FakeAcpConnection(init_hang=True)
    ok = _FakeAcpConnection()
    monkeypatch.setattr(ap, "spawn_agent_process", _fake_spawn([hung, ok], procs))
    monkeypatch.setattr(ap, "SPAWN_TIMEOUT", 0.05)
    mgr = AcpConnectionManager()

    async def spawn_hung():
        with pytest.raises(TransientError):
            await mgr.get("claude-code")

    t = asyncio.create_task(spawn_hung())
    await asyncio.sleep(0.01)
    # A different provider must not queue behind claude-code's hung spawn.
    conn = await asyncio.wait_for(mgr.get("gemini"), timeout=1.0)
    assert conn is not None
    await t
    await mgr.aclose()


async def test_aclose_discards_connections_and_removes_cwd(monkeypatch, tmp_path) -> None:
    procs: list = []
    monkeypatch.setattr(ap, "spawn_agent_process", _fake_spawn([_FakeAcpConnection()], procs))
    mgr = AcpConnectionManager()
    await mgr.get("gemini")
    cwd = mgr._cwd
    import os
    assert os.path.isdir(cwd)
    await mgr.aclose()
    assert not os.path.isdir(cwd), "translate-acp-* temp dir leaked"
    assert procs[0].returncode is not None
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_acp_providers.py -k "initialize or aclose" -v`
Expected: FAIL — no `SPAWN_TIMEOUT` attribute, orphaned process (proc still yielded into manager-lifetime stack), cwd leaked.

- [ ] **Step 3: Implement**

In `server/acp_providers.py`, after line 43 (`PROMPT_TIMEOUT = 600.0 ...`) add:

```python
SPAWN_TIMEOUT = 120.0  # spawn + initialize; npx may download the adapter on first use
SESSION_TIMEOUT = 60.0  # new_session / set_session_model / close_session
```

Replace the `_Conn` dataclass (lines 190–195) with:

```python
@dataclass
class _Conn:
    connection: Agent  # acp ClientSideConnection (implements the Agent interface)
    proc: object  # asyncio subprocess.Process
    client: _StreamingClient
    lock: asyncio.Lock
    stack: AsyncExitStack  # owns the subprocess; closing it terminates the agent
```

Replace `AcpConnectionManager.__init__`, `get`, and `_spawn` (lines 201–237) with:

```python
    def __init__(self) -> None:
        self._conns: dict[str, _Conn] = {}
        self._spawn_locks: dict[str, asyncio.Lock] = {
            pid: asyncio.Lock() for pid in PROVIDER_LAUNCH
        }
        self._cwd = tempfile.mkdtemp(prefix="translate-acp-")

    def _alive(self, conn: _Conn) -> bool:
        return getattr(conn.proc, "returncode", None) is None

    async def _discard(self, provider: str, conn: _Conn) -> None:
        """Remove a connection from the pool and terminate its agent (best-effort)."""
        if self._conns.get(provider) is conn:
            self._conns.pop(provider, None)
        try:
            if self._alive(conn):
                conn.proc.kill()  # type: ignore[attr-defined]
        except (ProcessLookupError, AttributeError):
            pass
        try:
            await asyncio.wait_for(conn.stack.aclose(), timeout=10.0)
        except Exception:  # noqa: BLE001 - already killed; nothing more to do
            pass

    async def get(self, provider: str) -> _Conn:
        if provider not in PROVIDER_LAUNCH:
            raise ConfigurationError(f"Unknown provider: {provider}")
        existing = self._conns.get(provider)
        if existing is not None and self._alive(existing):
            return existing
        async with self._spawn_locks[provider]:
            existing = self._conns.get(provider)
            if existing is not None and self._alive(existing):
                return existing
            if existing is not None:
                await self._discard(provider, existing)
            conn = await self._spawn(provider)
            self._conns[provider] = conn
            return conn

    async def _spawn(self, provider: str) -> _Conn:
        cmd, args = PROVIDER_LAUNCH[provider]
        env = _subprocess_env()
        executable = shutil.which(cmd, path=env.get("PATH")) or cmd
        # Base Client methods have empty bodies (fs/terminal ops we never advertise), so
        # the type checker treats them as abstract; instantiation is verified safe.
        client = _StreamingClient()  # type: ignore[abstract]
        stack = AsyncExitStack()
        try:
            connection, proc = await asyncio.wait_for(
                stack.enter_async_context(
                    spawn_agent_process(client, executable, *args, env=env)
                ),
                timeout=SPAWN_TIMEOUT,
            )
            await asyncio.wait_for(
                connection.initialize(protocol_version=PROTOCOL_VERSION),
                timeout=SPAWN_TIMEOUT,
            )
        except Exception as exc:  # noqa: BLE001 - normalize to our error taxonomy
            await stack.aclose()  # terminates the agent process if it was spawned
            if isinstance(exc, asyncio.TimeoutError):
                raise TransientError(
                    f"{provider} agent did not respond within {SPAWN_TIMEOUT:.0f}s of launch"
                ) from exc
            raise _classify(exc) from exc
        return _Conn(
            connection=connection, proc=proc, client=client,
            lock=asyncio.Lock(), stack=stack,
        )
```

Replace `aclose` (lines 297–299) with:

```python
    async def aclose(self) -> None:
        for provider, conn in list(self._conns.items()):
            await self._discard(provider, conn)
        shutil.rmtree(self._cwd, ignore_errors=True)
```

(The manager-lifetime `self._stack` field is gone — remove any remaining reference to it.)

Note: Task 2 already touched `_spawn`'s first lines; this task's version above is the final form and includes Task 2's env resolution.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/acp_providers.py tests/server/test_acp_providers.py
git commit -m "fix: per-connection lifecycle, per-provider spawn locks, spawn/init timeouts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Session-safe turns — id filtering, cancel+discard on timeout, close_session (R1, R2, R10)

**Files:**
- Modify: `server/acp_providers.py:169-187` (`_StreamingClient`), `:256-295` (`run_turn`)
- Test: `tests/server/test_acp_providers.py:125-136` (replace `test_streaming_client_denies_permissions`'s neighbor scope) and new tests

**Interfaces:**
- Consumes: `_Conn.stack`, `_discard` (Task 3), `SESSION_TIMEOUT`.
- Produces:
  - `_StreamingClient.begin_turn(*, session_id: str, on_text: Callable[[str], None]) -> None` and `end_turn() -> None`.
  - `run_turn(*, provider, model_arg, payload, on_token, on_notice=None) -> str` — `on_notice` threaded in Task 5.

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/test_acp_providers.py`:

```python
def _chunk(text: str):
    """Minimal stand-in matching the AgentMessageChunk isinstance check via monkeypatch."""
    from acp.schema import AgentMessageChunk, TextContentBlock

    return AgentMessageChunk(
        session_update="agent_message_chunk",
        content=TextContentBlock(type="text", text=text),
    )


async def test_streaming_client_ignores_chunks_from_other_sessions() -> None:
    from server.acp_providers import _StreamingClient

    c = _StreamingClient()
    seen: list[str] = []
    c.begin_turn(session_id="live", on_text=seen.append)
    await c.session_update(session_id="stale", update=_chunk("GARBAGE"))
    await c.session_update(session_id="live", update=_chunk("ok"))
    c.end_turn()
    await c.session_update(session_id="live", update=_chunk("late"))
    assert seen == ["ok"]


async def test_prompt_timeout_cancels_and_discards_the_connection(monkeypatch) -> None:
    procs: list = []
    conn_obj = _FakeAcpConnection()

    async def hanging_prompt(**kw):
        await asyncio.sleep(3600)

    conn_obj.prompt = hanging_prompt
    monkeypatch.setattr(ap, "spawn_agent_process", _fake_spawn([conn_obj], procs))
    monkeypatch.setattr(ap, "PROMPT_TIMEOUT", 0.05)
    mgr = AcpConnectionManager()
    with pytest.raises(TransientError, match="timed out"):
        await mgr.run_turn(provider="gemini", model_arg="", payload="p", on_token=None)
    assert conn_obj.cancelled == ["sid-1"], "session/cancel not sent on timeout"
    assert "gemini" not in mgr._conns, "timed-out connection must not be reused"
    assert procs[0].returncode is not None
    await mgr.aclose()


async def test_successful_turn_closes_its_session(monkeypatch) -> None:
    procs: list = []
    conn_obj = _FakeAcpConnection()
    monkeypatch.setattr(ap, "spawn_agent_process", _fake_spawn([conn_obj], procs))
    mgr = AcpConnectionManager()
    out = await mgr.run_turn(provider="gemini", model_arg="", payload="p", on_token=None)
    assert out == ""
    assert conn_obj.closed_sessions == ["sid-1"]
    await mgr.aclose()
```

If `TextContentBlock` has a different name in `acp.schema`, check with `.venv/bin/python -c "import acp.schema as s; print([n for n in dir(s) if 'Text' in n])"` and use the text content-block class that `text_block()` returns.

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_acp_providers.py -k "session or timeout_cancels" -v`
Expected: FAIL — `_StreamingClient` has no `begin_turn`; timeout neither cancels nor discards; `close_session` never called.

- [ ] **Step 3: Implement**

Replace `_StreamingClient` (lines 169–187) with:

```python
class _StreamingClient(Client):
    """ACP client that denies all tools and forwards streamed assistant text.

    A single instance is reused per connection. ``begin_turn`` arms it with the live
    session id and sink for the duration of a turn (turns are serialized per connection);
    chunks from any other session — e.g. a cancelled turn still streaming — are dropped.
    """

    def __init__(self) -> None:
        self.session_id: Optional[str] = None
        self.on_text: Optional[Callable[[str], None]] = None

    def begin_turn(self, *, session_id: str, on_text: Callable[[str], None]) -> None:
        self.session_id = session_id
        self.on_text = on_text

    def end_turn(self) -> None:
        self.session_id = None
        self.on_text = None

    async def request_permission(self, options, session_id, tool_call, **kwargs):  # type: ignore[override]
        # Pure text transform: never let the coding agent run a tool.
        return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))

    async def session_update(self, session_id, update, **kwargs):  # type: ignore[override]
        if session_id != self.session_id or self.on_text is None:
            return  # stale/foreign session or no active turn
        if isinstance(update, AgentMessageChunk):
            text = getattr(update.content, "text", None)
            if isinstance(text, str) and text:
                self.on_text(text)
```

Replace `run_turn` (lines 256–295) with:

```python
    async def run_turn(
        self,
        *,
        provider: str,
        model_arg: str,
        payload: str,
        on_token: Optional[Callable[[str], None]],
        on_notice: Optional[Callable[[str], None]] = None,
    ) -> str:
        conn = await self.get(provider)
        async with conn.lock:
            parts: list[str] = []

            def sink(chunk: str) -> None:
                parts.append(chunk)
                if on_token is not None:
                    on_token(chunk)

            sid: Optional[str] = None
            try:
                session = await asyncio.wait_for(
                    conn.connection.new_session(cwd=self._cwd), timeout=SESSION_TIMEOUT
                )
                sid = session.session_id
                conn.client.begin_turn(session_id=sid, on_text=sink)
                target = self._resolve_model(model_arg, getattr(session, "models", None))
                if target is not None:
                    try:
                        await asyncio.wait_for(
                            conn.connection.set_session_model(model_id=target, session_id=sid),
                            timeout=SESSION_TIMEOUT,
                        )
                    except Exception as exc:  # noqa: BLE001 - model switch is best-effort
                        if on_notice is not None:
                            on_notice(
                                f"could not select model '{model_arg}' ({exc}); "
                                "using the agent's current default"
                            )
                elif model_arg and model_arg != "default":
                    if on_notice is not None:
                        on_notice(
                            f"model '{model_arg}' is not exposed by {provider}; "
                            "using the agent's default model"
                        )
                await asyncio.wait_for(
                    conn.connection.prompt(prompt=[text_block(payload)], session_id=sid),
                    timeout=PROMPT_TIMEOUT,
                )
            except (ConfigurationError, TransientError):
                raise
            except asyncio.TimeoutError as exc:
                # The agent may still be generating into this session; the connection
                # can't be trusted for reuse (late chunks would contaminate a retry).
                if sid is not None:
                    try:
                        await asyncio.wait_for(
                            conn.connection.cancel(session_id=sid), timeout=5.0
                        )
                    except Exception:  # noqa: BLE001 - cancel is best-effort
                        pass
                await self._discard(provider, conn)
                raise TransientError(f"agent timed out after {PROMPT_TIMEOUT:.0f}s") from exc
            except Exception as exc:  # noqa: BLE001
                raise _classify(exc) from exc
            else:
                try:
                    await asyncio.wait_for(
                        conn.connection.close_session(session_id=sid), timeout=SESSION_TIMEOUT
                    )
                except Exception:  # noqa: BLE001 - close_session is optional in ACP
                    pass
                return "".join(parts)
            finally:
                conn.client.end_turn()
```

Note the timeout branch catches `asyncio.TimeoutError` from `new_session`, `set_session_model` (already swallowed), and `prompt` alike — all discard the connection.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/acp_providers.py tests/server/test_acp_providers.py
git commit -m "fix: session-id chunk filtering, cancel+discard on timeout, close sessions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Model-substitution notices through chat() and rounds (R6)

**Files:**
- Modify: `server/acp_providers.py:329-362` (`AcpProviderClient.chat`)
- Modify: `server/rounds.py:73-101` (`run_editor_pass` signature + `client.chat` call), `server/rounds.py:206-225` (`run_reviewer_pass` same)
- Test: `tests/server/test_acp_providers.py`

**Interfaces:**
- Consumes: `run_turn(..., on_notice=...)` (Task 4).
- Produces: `chat(*, model, system, user, retry_delays=..., on_retry=None, on_token=None, on_notice=None) -> str`; `run_editor_pass(..., on_notice=None)`, `run_reviewer_pass(..., on_notice=None)`. Task 6 wires routes to these.

- [ ] **Step 1: Write the failing test**

Append to `tests/server/test_acp_providers.py` (note `_FakeManager.run_turn` must gain the kwarg — update it in the same edit, adding `on_notice=None` to its signature and forwarding a canned call):

In the existing `_FakeManager` class, change the `run_turn` signature (line 46) to:

```python
    async def run_turn(self, *, provider, model_arg, payload, on_token, on_notice=None):
        if on_notice is not None and getattr(self, "notice", None):
            on_notice(self.notice)
```

(keep the rest of the body), and add `self.notice = None` in its `__init__`. Then append:

```python
async def test_chat_forwards_model_substitution_notices(client_with) -> None:
    client, mgr = client_with(chunks=["x"])
    mgr.notice = "model 'opus' is not exposed by claude-code; using the agent's default model"
    notices: list[str] = []
    await client.chat(
        model="claude-code/opus", system="s", user="u", on_notice=notices.append
    )
    assert notices == [mgr.notice]
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_acp_providers.py::test_chat_forwards_model_substitution_notices -v`
Expected: FAIL — `chat() got an unexpected keyword argument 'on_notice'`.

- [ ] **Step 3: Implement**

In `AcpProviderClient.chat` (line 329), add the parameter after `on_token`:

```python
        on_token: Optional[Callable[[str], None]] = None,
        on_notice: Optional[Callable[[str], None]] = None,
```

and forward it in the `run_turn` call:

```python
                return await self._manager.run_turn(
                    provider=provider,
                    model_arg=model_arg,
                    payload=payload,
                    on_token=on_token,
                    on_notice=on_notice,
                )
```

In `server/rounds.py`, add `on_notice=None,` after `on_token=None,` in both `run_editor_pass` (line 87) and `run_reviewer_pass` (line 219) signatures, and add `on_notice=on_notice` to both `client.chat(...)` calls (lines 100–102 and 223–225), e.g.:

```python
    raw = await client.chat(
        model=model, system=system, user=user_msg,
        on_retry=on_retry, on_token=on_token, on_notice=on_notice,
    )
```

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS (routes tests mock `chat` with `AsyncMock`, which accepts any kwargs).

- [ ] **Step 5: Commit**

```bash
git add server/acp_providers.py server/rounds.py tests/server/test_acp_providers.py
git commit -m "feat: surface model-substitution notices through chat() and round passes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Provider-specific preflight + route callback helper with token coalescing (R5, R9-server, R11)

**Files:**
- Modify: `server/acp_providers.py` (add `require_provider` after `split_model`, ~line 166)
- Modify: `server/routes/chapters.py:42-48` (`_make_client`), `:86-92` and `:178-184` (callers), `:135-149` and `:219-233` (publisher lambdas → helper)
- Test: `tests/server/test_acp_providers.py`, `tests/server/test_routes_chapters.py`

**Interfaces:**
- Consumes: `detect_providers` (Task 2), `chat(..., on_notice=...)` (Task 5).
- Produces:
  - `require_provider(model: str) -> str` in `server.acp_providers` (raises `ConfigurationError`).
  - `_make_client(model: str) -> AcpProviderClient` in `server.routes.chapters` — **signature change**: takes the requested model string, not `cfg`. Existing tests monkeypatch `_make_client` with a 1-arg lambda, so they keep working.
  - `_round_callbacks(chapter: int, round_n: int, stage: str) -> tuple[on_retry, coalescer, on_notice]` module-level helper in `server.routes.chapters`, where `coalescer` is a `_TokenCoalescer` with a `.flush()` method.

- [ ] **Step 1: Write the failing tests**

Append to `tests/server/test_acp_providers.py`:

```python
def test_require_provider_rejects_unknown_provider_with_guidance() -> None:
    from server.acp_providers import require_provider

    with pytest.raises(ConfigurationError) as ei:
        require_provider("anthropic/claude-sonnet-4")  # stale OpenRouter-era id
    msg = str(ei.value)
    assert "anthropic" in msg
    assert "claude-code" in msg  # lists the valid providers
    assert "default" in msg.lower()  # hints that a saved default may be stale


def test_require_provider_rejects_undetected_provider(monkeypatch) -> None:
    import server.acp_providers as ap

    monkeypatch.setattr(
        ap, "detect_providers",
        lambda: [{"id": pid, "name": ap._PROVIDER_NAMES[pid], "detected": pid == "gemini"}
                 for pid in ap.PROVIDER_LAUNCH],
    )
    assert ap.require_provider("gemini/gemini-2.5-pro") == "gemini"
    with pytest.raises(ConfigurationError, match="Claude Code"):
        ap.require_provider("claude-code/opus")
```

Append to `tests/server/test_routes_chapters.py`:

```python
def test_round_rejects_unknown_provider_before_any_event(app_with_book) -> None:
    client, slug = app_with_book
    r = client.post(
        f"/books/{slug}/chapter/1/round/editor",
        json={"model": "anthropic/claude-sonnet-4"},
    )
    assert r.status_code == 400
    assert "anthropic" in r.json()["detail"]
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_acp_providers.py -k require_provider tests/server/test_routes_chapters.py::test_round_rejects_unknown_provider_before_any_event -v`
Expected: FAIL — `require_provider` doesn't exist; the route currently 400s only if NO provider is detected (on a dev machine with a CLI installed it would 500/publish first).

- [ ] **Step 3: Implement**

In `server/acp_providers.py`, after `split_model` (line 166), add:

```python
def require_provider(model: str) -> str:
    """Validate that ``model`` names an installed provider; return the provider id.

    Raises ConfigurationError with an actionable message otherwise — including the
    stale-saved-default case where the model id predates the subscription switch
    (e.g. an OpenRouter id like 'anthropic/claude-sonnet-4').
    """
    provider, _ = split_model(model)
    if provider not in PROVIDER_LAUNCH:
        valid = ", ".join(sorted(PROVIDER_LAUNCH))
        raise ConfigurationError(
            f"Unknown provider '{provider}' in model '{model}'. Valid providers: {valid}. "
            "If this model came from a saved default, it may predate the switch to "
            "subscription providers — pick a model from the list in Settings."
        )
    detected = {p["id"]: p["detected"] for p in detect_providers()}
    if not detected.get(provider):
        raise ConfigurationError(
            f"{_PROVIDER_NAMES[provider]} is not installed (required for model "
            f"'{model}'). Install and sign in to it, or pick a model from a "
            "detected provider."
        )
    return provider
```

In `server/routes/chapters.py`:

Replace `_make_client` (lines 42–48) with:

```python
def _make_client(model: str) -> AcpProviderClient:
    require_provider(model)
    return AcpProviderClient()
```

Update the import on line 10 to `from server.acp_providers import AcpProviderClient, require_provider` (drop `detect_providers`). Update both call sites (lines 88–92 and 180–184) from:

```python
    cfg = load_config()
    try:
        client = _make_client(cfg)
```

to:

```python
    try:
        client = _make_client(req.model)
```

and delete the now-unused `cfg = load_config()` lines and the `Config, load_config` import (line 11) if nothing else in the module uses them.

Add the callback helper above the routes (after `RoundRequest`, ~line 40):

```python
class _TokenCoalescer:
    """Buffers streamed chunks; publishes one token event per ~300 chars.

    A 5000-token round would otherwise publish thousands of SSE events and force a
    client re-render per token. Call ``flush()`` after the pass returns (success or
    failure) so the tail is not lost.
    """

    def __init__(self, publish, threshold: int = 300) -> None:
        self._publish = publish
        self._threshold = threshold
        self._buf: list[str] = []
        self._size = 0

    def __call__(self, chunk: str) -> None:
        self._buf.append(chunk)
        self._size += len(chunk)
        if self._size >= self._threshold:
            self.flush()

    def flush(self) -> None:
        if self._buf:
            self._publish("".join(self._buf))
            self._buf.clear()
            self._size = 0


def _round_callbacks(chapter: int, round_n: int, stage: str):
    """on_retry / on_token / on_notice publishers shared by the editor and reviewer routes."""

    def on_retry(attempt: int, total: int) -> None:
        EVENT_BUS.publish({
            "type": "status", "chapter": chapter, "round": round_n, "stage": stage,
            "phase": "retry",
            "text": f"Ch {chapter} R{round_n} {stage.capitalize()} — retry {attempt}/{total}...",
        })

    coalescer = _TokenCoalescer(lambda text: EVENT_BUS.publish({
        "type": "token", "chapter": chapter, "round": round_n, "stage": stage, "text": text,
    }))

    def on_notice(text: str) -> None:
        EVENT_BUS.publish({
            "type": "status", "chapter": chapter, "round": round_n, "stage": stage,
            "phase": "notice",
            "text": f"Ch {chapter} R{round_n} {stage.capitalize()} — {text}",
        })

    return on_retry, coalescer, on_notice
```

In `post_round_editor`, before the `try:` around `run_editor_pass` add `on_retry, on_token, on_notice = _round_callbacks(n, next_round, "editor")`, replace the two inline lambdas (lines 135–149) with `on_retry=on_retry, on_token=on_token, on_notice=on_notice,`, and wrap the call so the coalescer always flushes:

```python
    try:
        await run_editor_pass(
            ...existing args...,
            on_retry=on_retry,
            on_token=on_token,
            on_notice=on_notice,
        )
    except RecoverableError as exc:
        ...
    finally:
        on_token.flush()
```

Python allows `finally` alongside the existing `except` clauses — attach it to the same `try`. Do the same in `post_round_reviewer` with `_round_callbacks(n, review_round, "reviewer")`.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS. If `test_post_round_*` tests fail on the monkeypatched `_make_client` lambda arity, they already use a 1-arg lambda (`lambda cfg: fake_client`) so they pass unchanged; rename the param to `model` in those lambdas anyway for clarity.

- [ ] **Step 5: Commit**

```bash
git add server/acp_providers.py server/routes/chapters.py tests/server/test_acp_providers.py tests/server/test_routes_chapters.py
git commit -m "fix: preflight validates the requested provider; coalesce token events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Bounded SSE queues (R9-server)

**Files:**
- Modify: `server/sse.py:12-18`
- Test: `tests/server/test_sse.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: same `EventBus` API; queues bounded at 1000, drop-oldest.

- [ ] **Step 1: Write the failing test**

Append to `tests/server/test_sse.py` (match the file's existing async test style — read it first; if it uses a different harness, adapt the assertions, not the behavior):

```python
async def test_publish_drops_oldest_when_a_subscriber_stalls() -> None:
    import asyncio

    from server.sse import EventBus

    bus = EventBus()
    received: list[dict] = []

    async def slow_consumer():
        async for evt in bus.subscribe(timeout=0.2):
            received.append(evt)

    task = asyncio.create_task(slow_consumer())
    await asyncio.sleep(0.01)  # let subscribe() register its queue
    for i in range(1100):  # exceed the 1000 bound
        bus.publish({"type": "token", "i": i})
    await task
    assert len(received) == 1000
    assert received[0]["i"] == 100  # oldest 100 were dropped
    assert received[-1]["i"] == 1099  # newest survive
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_sse.py::test_publish_drops_oldest_when_a_subscriber_stalls -v`
Expected: FAIL — unbounded queue delivers all 1100.

- [ ] **Step 3: Implement**

In `server/sse.py`, replace `publish` (lines 12–14) with:

```python
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
```

and in `subscribe` (line 17) change `q: asyncio.Queue = asyncio.Queue()` to `q: asyncio.Queue = asyncio.Queue(maxsize=1000)`.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/sse.py tests/server/test_sse.py
git commit -m "fix: bound SSE subscriber queues at 1000 events, drop-oldest

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Remove the OpenRouter path — server (R7)

**Files:**
- Delete: `server/openrouter.py`, `tests/server/test_openrouter.py`
- Modify: `server/config.py:31`, `server/acp_providers.py:1-19` (module docstring), `server/routes/settings.py:22-23` (comment), `tests/server/test_config.py`, `tests/server/test_routes_chapters.py:18-19`, `tests/server/test_routes_settings.py:8-25`
- Rewrite: `tests/server/test_e2e_smoke.py`

**Interfaces:**
- Consumes: `AcpProviderClient` (final form from Tasks 4–5), `shutdown_manager` (`server/acp_providers.py:313`).
- Produces: `Config` without `openrouter_api_key`; smoke test gated on `TRANSLATE_E2E_MODEL`.

- [ ] **Step 1: Update the config/settings tests to the new contract (failing first)**

In `tests/server/test_config.py`: delete line 12 (`assert cfg.openrouter_api_key == ""`); in `test_save_writes_json_and_round_trips` replace the `Config(...)` construction and assertions with:

```python
    cfg = Config(
        default_models={"editor": "claude-code/opus", "reviewer": "gemini/gemini-2.5-pro"},
    )
    save_config(cfg)
    loaded = load_config()
    assert loaded.default_models.editor == "claude-code/opus"
    assert loaded.default_models.reviewer == "gemini/gemini-2.5-pro"
```

in `test_save_sets_mode_600` replace `Config(openrouter_api_key="x")` with `Config()`. Add a back-compat test:

```python
def test_load_ignores_stale_openrouter_key(translate_root: Path) -> None:
    """Configs written before the subscription switch still load cleanly."""
    p = translate_root / "config.json"
    p.write_text('{"openrouter_api_key": "sk-or-stale", "default_models": {"editor": "e", "reviewer": "r"}}')
    cfg = load_config()
    assert not hasattr(cfg, "openrouter_api_key")
    assert cfg.default_models.editor == "e"
```

In `tests/server/test_routes_settings.py`: change line 12's assertion to `assert "openrouter_api_key" not in r.json()`; in `test_put_settings_persists` drop the `"openrouter_api_key"` key from the PUT body, change the default models to `{"editor": "claude-code/opus", "reviewer": "gemini/gemini-2.5-pro"}`, replace line 23's assertion with `assert "openrouter_api_key" not in r2.json()`, and update line 24's expected editor accordingly.

In `tests/server/test_routes_chapters.py` line 18, replace with:

```python
    save_config(Config(default_models={"editor": "ed", "reviewer": "rv"}))
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/python -m pytest tests/server/test_config.py tests/server/test_routes_settings.py -q`
Expected: FAIL — `Config` still has the field, GET /settings still returns it.

- [ ] **Step 3: Implement**

- Delete line 31 of `server/config.py` (`openrouter_api_key: str = ""`).
- `git rm server/openrouter.py tests/server/test_openrouter.py`.
- In `server/acp_providers.py`, rewrite the module docstring's lines 5–9 to drop the "drop-in replacement for server.openrouter" claim — it now IS the only client; keep the `chat()` seam description. Change line 43's comment from `# seconds, matches the OpenRouter client` to `# seconds per prompt`. Change line 321's class docstring to `"""Provider client backed by locally-installed ACP agents."""`.
- In `server/routes/settings.py` line 22–23, reword the comment: `# CLI-routable models in the catalog's model-object shape, with $0 pricing (the user's subscription covers usage).`
- Rewrite `tests/server/test_e2e_smoke.py` in full:

```python
"""Real-agent smoke test. Skipped unless TRANSLATE_E2E_MODEL is set.

Run manually before each release, with that provider's CLI installed and signed in:

    TRANSLATE_E2E_MODEL=claude-code/sonnet pytest tests/server/test_e2e_smoke.py -v -s
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from server.acp_providers import AcpProviderClient, shutdown_manager
from server.config import Config
from server.docx_io import parse_docx
from server.ingest import ingest_book
from server.rounds import run_editor_pass, run_reviewer_pass

pytestmark = pytest.mark.skipif(
    "TRANSLATE_E2E_MODEL" not in os.environ,
    reason="set TRANSLATE_E2E_MODEL (e.g. claude-code/sonnet) to run the e2e test",
)


async def test_real_round_against_local_agent(translate_root: Path, fixtures_dir: Path) -> None:
    model = os.environ["TRANSLATE_E2E_MODEL"]
    result = ingest_book(
        translated_path=fixtures_dir / "sample-fr-folder",
        english_path=fixtures_dir / "sample-en-folder",
        language_pair=("en", "fr"),
        ingestion=Config().ingestion,
    )
    en = parse_docx(translate_root / result.slug / "source-en" / "ch01.docx")
    fr = parse_docx(translate_root / result.slug / "source-translated" / "ch01.docx")
    client = AcpProviderClient()
    try:
        edited = await run_editor_pass(
            client=client,
            slug=result.slug,
            chapter_n=1,
            round_n=1,
            en_doc=en,
            target_doc=fr,
            source_code="en",
            target_code="fr",
            editor_prompt_template=(
                "Proofread the {TARGET_LANG_NAME} translation. Return target lines only "
                "in `{TARGET_LANG_CODE}:` format, one per `[N]` block. Preserve italic and bold."
            ),
            prior_reviewer_suggestions=None,
            model=model,
        )
        assert len(edited.paragraphs) == len(en.paragraphs)

        reviewer_result = await run_reviewer_pass(
            client=client,
            slug=result.slug,
            chapter_n=1,
            round_n=1,
            en_doc=en,
            target_doc=edited,
            source_code="en",
            target_code="fr",
            reviewer_prompt_template=(
                "Review the {TARGET_LANG_NAME} translation. Return JSON list of "
                '{"quote", "comment"} only. Be concise.'
            ),
            model=model,
        )
        assert reviewer_result.raw_response  # something came back
    finally:
        await shutdown_manager()
```

- Grep-check: `grep -rn "openrouter" server/ tests/ --include="*.py" -i` must return nothing.

- [ ] **Step 4: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q`
Expected: PASS (smoke test reports SKIPPED).

- [ ] **Step 5: Commit**

```bash
git add -A server tests
git commit -m "refactor!: remove the OpenRouter client, config key, and smoke-test path

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Remove OpenRouter from the client + fix the refresh button (R7, R11)

**Files:**
- Modify: `client/src/types/api.ts:94-95` (Settings), `:132-133` (comment)
- Modify: `client/src/views/SettingsRoute.tsx:10-12`, `:21-22`, `:33-49`, `:54-65`, `:104-107`, `:129`, `:148`
- Modify: `client/src/api/settings.test.ts`, `client/src/types/api.test.ts:67-71`, `client/src/App.test.tsx:37`, `client/src/views/ChapterRoute.test.tsx:43`, `client/src/views/SettingsRoute.test.tsx:12`

**Interfaces:**
- Consumes: server contract from Task 8 (`/settings` without the key).
- Produces: `Settings` type without `openrouter_api_key`; `SettingsRoute` with `refreshing` derived from hook `loading` flags (Task 10 later swaps the hooks' internals; the `{ models, refresh, loading, error }` shape is stable).

- [ ] **Step 1: Update the type and let the compiler find every reference**

In `client/src/types/api.ts`, delete line 95 (`openrouter_api_key: string;`) and reword the comment on lines 132–133 to `// Model metadata returned by GET /models (catalog objects; fields optional).`

Run: `cd client && npx tsc -b --noEmit 2>&1 | head -30` — this enumerates every remaining reference; fix each as below.

- [ ] **Step 2: Fix SettingsRoute**

In `client/src/views/SettingsRoute.tsx`:

- Line 10–12, take the loading flags:

```tsx
  const { settings, save, loading, error } = useSettings();
  const { models, refresh: refreshModels, error: modelsError, loading: modelsLoading } = useModels();
  const { providers, refresh: refreshProviders, loading: providersLoading } = useProviders();
```

- Delete lines 21–22 (`refreshError`, `refreshing` state).
- In `handleSave` (line 37–44), delete the `openrouter_api_key: settings.openrouter_api_key,` line.
- Replace `handleRefreshModels` (lines 51–65) with:

```tsx
  // Refresh the model list and re-detect installed provider CLIs. Fetch errors land in
  // the hooks' own error state (modelsError); the busy state is the hooks' loading flags.
  const refreshing = modelsLoading || providersLoading;
  const handleRefreshModels = () => {
    refreshModels();
    refreshProviders();
  };
```

- In the JSX (lines 104–115): keep `disabled={refreshing}` and the `{refreshing ? "Refreshing…" : "Refresh model list"}` label; delete the `{refreshError && ...}` span and simplify the two conditions that referenced `refreshError`:

```tsx
          {modelsError && <span className="text-sm text-red-600">{modelsError.message}</span>}
          {!modelsError && models.length > 0 && (
            <span className="text-sm text-gray-500">{models.length} models</span>
          )}
```

- Line 129: `placeholder="claude-code/opus"`. Line 148: `placeholder="gemini/gemini-2.5-pro"`.

- [ ] **Step 3: Fix the tests the compiler flagged**

Remove the `openrouter_api_key` property from the fixture objects in `client/src/App.test.tsx:37`, `client/src/views/ChapterRoute.test.tsx:43`, `client/src/views/SettingsRoute.test.tsx:12`, and `client/src/types/api.test.ts:67` (also delete its assertion on line 71). In `client/src/api/settings.test.ts`, remove the key from both fixture payloads and replace the two assertions (`expect(s.openrouter_api_key)...`, `expect(JSON.parse(init.body...).openrouter_api_key)...`) with assertions on `default_models.editor` round-tripping.

- [ ] **Step 4: Run client tests and build**

Run: `cd client && npm test && npm run build`
Expected: PASS / compiles clean. `grep -rn "openrouter" client/src -i` returns nothing.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "refactor: drop openrouter_api_key from the client; derive refresh state from hooks

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Shared useFetch hook (R11)

**Files:**
- Create: `client/src/hooks/useFetch.ts`
- Modify: `client/src/hooks/useModels.ts`, `client/src/hooks/useProviders.ts` (full rewrites)
- Test: existing suites cover behavior (`SettingsRoute.test.tsx`, `App.test.tsx`); add `client/src/hooks/useFetch.test.tsx`

**Interfaces:**
- Consumes: `getModels`/`getProviders` from `client/src/api/settings`.
- Produces: `useFetch<T>(fetcher: () => Promise<T>, initial: T): { data: T; refresh: () => void; loading: boolean; error: Error | null }`. `useModels`/`useProviders` keep their exact current return shapes (`{ models | providers, refresh, loading, error }`) so no caller changes.

- [ ] **Step 1: Write the failing test**

Create `client/src/hooks/useFetch.test.tsx`:

```tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFetch } from "./useFetch";

describe("useFetch", () => {
  it("fetches on mount, exposes data, and refetches on refresh()", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return [`result-${calls}`];
    });
    const { result } = renderHook(() => useFetch<string[]>(fetcher, []));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(["result-1"]);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toEqual(["result-2"]));
    expect(result.current.error).toBeNull();
  });

  it("captures fetch errors without throwing", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("nope");
    });
    const { result } = renderHook(() => useFetch<string[]>(fetcher, []));
    await waitFor(() => expect(result.current.error?.message).toBe("nope"));
    expect(result.current.data).toEqual([]);
  });
});
```

Run: `cd client && npx vitest run src/hooks/useFetch.test.tsx` — Expected: FAIL (module missing). (If `renderHook` is unavailable in the installed @testing-library/react version, wrap in a probe component instead — check the version first with `grep testing-library package.json`.)

- [ ] **Step 2: Implement**

Create `client/src/hooks/useFetch.ts`:

```ts
import { useCallback, useEffect, useState } from "react";

/** Fetch-on-mount state triple shared by useModels/useProviders. */
export function useFetch<T>(fetcher: () => Promise<T>, initial: T): {
  data: T;
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
    // fetcher is a module-level API function; identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, refresh, loading, error };
}
```

Rewrite `client/src/hooks/useModels.ts`:

```ts
import { getModels } from "../api/settings";
import type { Model } from "../types/api";
import { useFetch } from "./useFetch";

export function useModels(): {
  models: Model[];
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const { data: models, refresh, loading, error } = useFetch<Model[]>(getModels, []);
  return { models, refresh, loading, error };
}
```

Rewrite `client/src/hooks/useProviders.ts` identically with `getProviders`/`Provider`/`providers`.

- [ ] **Step 3: Run client tests and build**

Run: `cd client && npm test && npm run build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks
git commit -m "refactor: fold useModels/useProviders into a shared useFetch hook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Stream pane — chapter filtering and retry reset (R8)

**Files:**
- Modify: `client/src/views/ChapterRoute.tsx:73-92`
- Test: `client/src/views/ChapterRoute.test.tsx`

**Interfaces:**
- Consumes: `AppEvent` union (`client/src/types/api.ts:115-129`; `token`/`status` events carry optional `chapter`).
- Produces: no API change.

- [ ] **Step 1: Write the failing test**

`ChapterRoute.test.tsx` already mocks `useEvents` or the EventSource — read its existing setup first and register events the same way it does. Add a test that (a) dispatches a `token` event for a different chapter and asserts the stream pane does not show it, and (b) dispatches `status phase:"retry"` for the viewed chapter after some tokens and asserts the stream cleared. Shape (adapt the event-dispatch helper to the file's existing pattern):

```tsx
it("ignores token events from other chapters and resets on retry", async () => {
  renderChapterRoute({ n: 3 });                       // file's existing helper
  emitEvent({ type: "token", chapter: 7, text: "WRONG-CHAPTER" });
  emitEvent({ type: "token", chapter: 3, text: "mine" });
  expect(await screen.findByText(/mine/)).toBeInTheDocument();
  expect(screen.queryByText(/WRONG-CHAPTER/)).toBeNull();
  emitEvent({ type: "status", chapter: 3, phase: "retry", text: "retrying" });
  emitEvent({ type: "token", chapter: 3, text: "attempt2" });
  expect(await screen.findByText(/attempt2/)).toBeInTheDocument();
  expect(screen.queryByText(/mine/)).toBeNull();      // buffer was reset on retry
});
```

Run: `cd client && npx vitest run src/views/ChapterRoute.test.tsx` — Expected: FAIL (wrong-chapter text renders; retry does not clear).

- [ ] **Step 2: Implement**

Replace the `useEvents` callback (lines 73–92) with:

```tsx
  useEvents(
    useCallback((e) => {
      // The activity log shows everything (batch runs span chapters); the live
      // stream pane shows only THIS chapter's current attempt.
      const mine = e.chapter === undefined || e.chapter === n;
      if (e.type === "status") {
        appendActivity(e.text, "status");
        // Reset on a new send AND on a retry, so a failed attempt's partial
        // output never concatenates with its retry's.
        if (mine && (e.phase === "sent" || e.phase === "retry")) setStream("");
      } else if (e.type === "token") {
        if (!mine) return;
        // Keep only a rolling tail so the buffer can't grow unbounded.
        setStream((prev) => (prev + e.text).slice(-4000));
      } else if (e.type === "round_complete") {
        appendActivity(
          `✓ Ch ${e.chapter ?? "?"} R${e.round} ${e.stage} complete`,
          "complete",
        );
        if (mine) setStream("");
      } else if (e.type === "error") {
        appendActivity(`⚠ ${e.text}`, "error");
        if (mine) setStream("");
      }
    }, [appendActivity, n])
  );
```

Note `useEvents` captures the handler at mount (`useEvents.ts:17`); `n` comes from route params, and the component remounts per route, so the captured `n` is correct. Keep the `useCallback` deps as `[appendActivity, n]`.

- [ ] **Step 3: Run client tests**

Run: `cd client && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/views/ChapterRoute.tsx client/src/views/ChapterRoute.test.tsx
git commit -m "fix: stream pane shows only the viewed chapter's current attempt

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Memoize the paragraph diff (R9-client)

**Files:**
- Modify: `client/src/components/DiffView.tsx:1,17`

**Interfaces:** none.

- [ ] **Step 1: Implement (no new test — behavior is identical; existing DiffView.test.tsx guards it)**

In `client/src/components/DiffView.tsx`, add `useMemo` to the React import and change line 17 from:

```tsx
  const blocks = diffParagraphs(prev, next);
```

to:

```tsx
  // LCS over every paragraph — recompute only when the docs change, not on
  // every parent re-render (token events re-render ChapterRoute constantly).
  const blocks = useMemo(() => diffParagraphs(prev, next), [prev, next]);
```

(If the file has no React import line, add `import { useMemo } from "react";`.)

- [ ] **Step 2: Run client tests and build**

Run: `cd client && npm test && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/DiffView.tsx
git commit -m "perf: memoize DiffView's paragraph diff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Server cleanup — dead code (R11)

**Files:**
- Modify: `server/acp_providers.py:326-327` (delete `list_models`), `:362` (dead raise)
- Modify: `tests/server/test_acp_providers.py:61-66` (fixture)

**Interfaces:**
- Produces: `AcpProviderClient` without `list_models` (verify no callers: `grep -rn "list_models" server client tests` must show none after Task 8 deleted the OpenRouter files).

- [ ] **Step 1: Implement**

- Delete the `list_models` method (lines 326–327).
- Replace the final line of `chat()` (`raise last_exc or TransientError("retry loop exited without result")`) with:

```python
        # Reachable only when retry_delays is empty (no attempt was made).
        raise TransientError("retry_delays was empty; no attempt was made")
```

and delete the now-unused `last_exc: Optional[Exception] = None` assignment and its `last_exc = exc` write if nothing else reads it.
- In `tests/server/test_acp_providers.py:62`, change `def client_with(monkeypatch):` to `def client_with():`.

- [ ] **Step 2: Run the suite**

Run: `.venv/bin/python -m pytest tests/server -q && grep -rn "list_models" server tests | wc -l`
Expected: PASS and `0`.

- [ ] **Step 3: Commit**

```bash
git add server/acp_providers.py tests/server/test_acp_providers.py
git commit -m "chore: drop unused list_models, dead retry variable, unused fixture param

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Documentation (R12)

**Files:**
- Create: `USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER_v3.md` (copy of `_v2.md`, then edit — **never modify `_v2.md` or the unsuffixed original**)
- Check: `README.md` for stale OpenRouter setup instructions (if changes are needed, create `README_v2.md`... unless a `README_v#.md` already exists, in which case use the next number)

**Interfaces:** none.

- [ ] **Step 1: Write v3**

`cp USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER_v2.md USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER_v3.md`, then update the copy:

- Remove/replace the section documenting the leftover `openrouter_api_key` config field (it no longer exists; stale keys in `~/.translate/config.json` are ignored on load and dropped on next save).
- Document detection semantics: a provider shows "detected" only when every binary its launch needs is on the server's (augmented) PATH — `claude`+`npx`, `codex`+`npx`, `gemini`, `qwen`.
- Document timeout behavior: 120s to launch/initialize an agent, 600s per prompt; a timed-out turn is cancelled and the agent restarted on retry.
- Document the new smoke test: `TRANSLATE_E2E_MODEL=claude-code/sonnet pytest tests/server/test_e2e_smoke.py -v -s` (replaces the `OPENROUTER_API_KEY` variant).
- Document the `phase: "notice"` activity-log message shown when a requested model isn't available and the agent's default is used instead.

- [ ] **Step 2: Check the README**

`grep -in "openrouter" README.md` — if it documents the API-key setup or the old smoke test, create the next `README_v#.md` (side-by-side) with those sections corrected. If it has no stale content, skip.

- [ ] **Step 3: Commit**

```bash
git add USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER_v3.md README*.md
git commit -m "docs: v3 subscription guide — config key removal, detection, timeouts, smoke test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Final verification (after all tasks)

- [ ] `.venv/bin/python -m pytest tests/server -q` — all pass, smoke test skipped.
- [ ] `cd client && npm test && npm run build` — all pass, clean build.
- [ ] `grep -rni openrouter server client/src tests --include="*.py" --include="*.ts" --include="*.tsx"` — zero hits.
- [ ] `.venv/bin/python -m ruff check server tests` (project lint) — clean.
- [ ] Manual spot-check if a provider CLI is installed: start the app, request a round with model `anthropic/claude-sonnet-4` → HTTP 400 naming `anthropic` and suggesting Settings; no `sent` event in the activity log.

## Self-review notes (spec coverage)

- R1 → Task 4. R2 → Tasks 3–4. R3 → Task 1. R4 → Task 2. R5 → Task 6. R6 → Tasks 5–6. R7 → Tasks 8–9. R8 → Task 11. R9 → Tasks 6 (coalescer), 7 (queues), 12 (memo). R10 → Tasks 3–4. R11 → Tasks 6 (lambda dedupe), 9, 10, 13. R12 → Task 14.
- Type consistency: `_Conn.stack` (Task 3) consumed by Task 4's `_discard` path; `run_turn(on_notice=)` (Task 4) consumed by Task 5's `chat`; `_make_client(model)` (Task 6) matches the 1-arg monkeypatched lambdas in existing route tests; hook return shapes in Task 10 match Task 9's destructuring.
- Ordering: Tasks 1–8 are server-sequential (8 depends on 4–5 final signatures); 9 depends on 8; 10–12 are client-independent after 9; 13–14 last.
