from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

import server.acp_providers as ap
from server.acp_providers import (
    AcpConnectionManager,
    AcpProviderClient,
    detect_providers,
    model_catalog,
    split_model,
)
from server.errors import ConfigurationError, TransientError


def test_split_model_variants() -> None:
    assert split_model("claude-code/opus") == ("claude-code", "opus")
    assert split_model("codex/default") == ("codex", "default")
    assert split_model("qwen") == ("qwen", "")


def test_model_catalog_shape() -> None:
    cat = model_catalog()
    assert cat, "catalog must not be empty"
    for m in cat:
        assert "/" in m["id"]  # provider/model so the frontend can split it
        assert m["pricing"] == {"prompt": "0", "completion": "0"}
        assert "name" in m and "context_length" in m


def test_detect_providers_lists_all_four() -> None:
    ids = {p["id"] for p in detect_providers()}
    assert {"claude-code", "codex", "gemini", "qwen"} <= ids


def test_require_provider_rejects_unknown_provider_with_guidance() -> None:
    from server.acp_providers import require_provider

    with pytest.raises(ConfigurationError) as ei:
        require_provider("anthropic/claude-sonnet-4")  # stale pre-subscription-switch id
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


class _FakeManager:
    """Stands in for AcpConnectionManager.run_turn at the chat() boundary."""

    def __init__(self, *, chunks=None, exc=None, fail_times=0):
        self.chunks = chunks or []
        self.exc = exc
        self.fail_times = fail_times
        self.calls = 0
        self.last_payload = None
        self.last_provider = None
        self.last_model_arg = None
        self.notice = None

    async def run_turn(self, *, provider, model_arg, payload, on_token, on_notice=None):
        self.calls += 1
        self.last_provider = provider
        self.last_model_arg = model_arg
        self.last_payload = payload
        if on_notice is not None and getattr(self, "notice", None):
            on_notice(self.notice)
        if self.exc is not None and self.calls <= self.fail_times:
            raise self.exc
        out = []
        for c in self.chunks:
            if on_token is not None:
                on_token(c)
            out.append(c)
        return "".join(out)


@pytest.fixture
def client_with():
    def _make(**kw):
        mgr = _FakeManager(**kw)
        return AcpProviderClient(manager=mgr), mgr
    return _make


async def test_chat_accumulates_streamed_chunks_and_calls_on_token(client_with) -> None:
    client, mgr = client_with(chunks=["bon", "jour"])
    seen: list[str] = []
    out = await client.chat(
        model="gemini/gemini-2.5-pro",
        system="Reply in French.",
        user="hello",
        on_token=seen.append,
    )
    assert out == "bonjour"
    assert seen == ["bon", "jour"]
    assert mgr.last_provider == "gemini"
    assert mgr.last_model_arg == "gemini-2.5-pro"
    # system + user are folded into one payload (ACP prompts carry user content only).
    assert "Reply in French." in mgr.last_payload
    assert "hello" in mgr.last_payload


async def test_chat_retries_transient_then_succeeds(client_with) -> None:
    client, mgr = client_with(
        chunks=["ok"], exc=TransientError("blip"), fail_times=2
    )
    out = await client.chat(
        model="gemini/gemini-2.5-pro",
        system="s",
        user="u",
        retry_delays=[0, 0, 0],  # no real sleeps
    )
    assert out == "ok"
    assert mgr.calls == 3


async def test_chat_raises_transient_after_exhausting_retries(client_with) -> None:
    client, mgr = client_with(exc=TransientError("down"), fail_times=99)
    with pytest.raises(TransientError):
        await client.chat(model="gemini/x", system="s", user="u", retry_delays=[0, 0, 0])
    assert mgr.calls == 3


async def test_chat_does_not_retry_configuration_error(client_with) -> None:
    client, mgr = client_with(exc=ConfigurationError("sign in"), fail_times=99)
    with pytest.raises(ConfigurationError):
        await client.chat(model="claude-code/opus", system="s", user="u", retry_delays=[0, 0, 0])
    assert mgr.calls == 1  # blocked immediately, no retry


async def test_chat_forwards_model_substitution_notices(client_with) -> None:
    client, mgr = client_with(chunks=["x"])
    mgr.notice = "model 'opus' is not exposed by claude-code; using the agent's default model"
    notices: list[str] = []
    await client.chat(
        model="claude-code/opus", system="s", user="u", on_notice=notices.append
    )
    assert notices == [mgr.notice]


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


def test_streaming_client_denies_permissions() -> None:
    import asyncio

    from acp.schema import DeniedOutcome

    from server.acp_providers import _StreamingClient

    c = _StreamingClient()
    resp = asyncio.run(
        c.request_permission(options=[], session_id="s", tool_call=None)
    )
    assert isinstance(resp.outcome, DeniedOutcome)


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


class _FakeAcpConnection:
    """Stands in for acp's ClientSideConnection."""

    def __init__(self, *, init_exc: Exception | None = None, init_hang: bool = False):
        self.init_exc = init_exc
        self.init_hang = init_hang
        self.cancelled: list[str] = []
        self.closed_sessions: list[str] = []
        self.initialize_params: list[dict] = []
        # Production code initializes via the low-level dict path (see
        # _initialize_connection); route it through the same init_exc/init_hang knobs.
        self._conn = SimpleNamespace(send_request=self._send_request)

    async def _send_request(self, method, params):
        assert method == "initialize", f"unexpected raw request: {method}"
        self.initialize_params.append(params)
        await self.initialize()
        return {}

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


def _fake_spawn(
    connections: list[_FakeAcpConnection], procs: list, spawn_kwargs: list | None = None
) -> object:
    """Build a spawn_agent_process replacement that records kill() via proc.returncode."""

    @asynccontextmanager
    async def spawn(client, executable, *args, env=None, **kwargs):
        if spawn_kwargs is not None:
            spawn_kwargs.append(kwargs)
        conn = connections.pop(0)
        proc = SimpleNamespace(returncode=None)
        proc.kill = lambda: setattr(proc, "returncode", -9)
        procs.append(proc)
        try:
            yield conn, proc
        finally:
            proc.kill()  # mirrors real behavior: CM exit terminates the subprocess

    return spawn


async def test_initialize_sends_explicit_client_capabilities(monkeypatch) -> None:
    """gemini --experimental-acp hard-requires clientCapabilities (zod: Required), but
    the SDK's typed initialize() strips the default value from the wire
    (exclude_defaults) -> -32602 Invalid params. We must send the dict explicitly."""
    procs: list = []
    conn_obj = _FakeAcpConnection()
    monkeypatch.setattr(ap, "spawn_agent_process", _fake_spawn([conn_obj], procs))
    mgr = AcpConnectionManager()
    await mgr.get("gemini")
    assert conn_obj.initialize_params == [{
        "protocolVersion": 1,
        "clientCapabilities": {
            "fs": {"readTextFile": False, "writeTextFile": False},
            "terminal": False,
        },
    }]
    await mgr.aclose()


async def test_spawn_raises_the_stdio_stream_limit(monkeypatch) -> None:
    """Agents emit single JSON lines far beyond asyncio's 64KiB default (e.g. the
    available-commands session update); the default limit kills the connection with
    LimitOverrunError -> "Connection closed" on every turn."""
    procs: list = []
    spawn_kwargs: list = []
    monkeypatch.setattr(
        ap, "spawn_agent_process", _fake_spawn([_FakeAcpConnection()], procs, spawn_kwargs)
    )
    mgr = AcpConnectionManager()
    await mgr.get("gemini")
    assert spawn_kwargs[0].get("transport_kwargs") == {"limit": ap.STREAM_LIMIT}
    assert ap.STREAM_LIMIT >= 8 * 1024 * 1024
    await mgr.aclose()


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
