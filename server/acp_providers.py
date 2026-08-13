"""ACP-based provider client.

Routes Editor/Reviewer chats through locally-installed AI agents (Claude Code, Codex,
Gemini, Qwen) over the Agent Client Protocol (JSON-RPC 2.0 over stdio), using the user's
existing subscriptions instead of metered OpenRouter API calls.

This is a drop-in replacement for ``server.openrouter.OpenRouterClient``: it exposes the
same ``chat(*, model, system, user, retry_delays=..., on_retry=None)`` seam (plus an extra
``on_token`` streaming callback) so ``server.rounds`` is unchanged apart from the import.

Design:
- Agents are *coding* agents, so we deny every tool/permission request and advertise no
  filesystem/terminal capabilities — the agent can only emit text.
- One persistent connection per provider (lazily spawned, reused across chapters,
  serialized by a per-provider lock); the per-turn model is selected with
  ``set_session_model`` when the agent exposes the requested model.
- Streamed ``agent_message_chunk`` updates are accumulated into the final reply and also
  forwarded live to ``on_token`` for the activity log.
"""
from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Callable, Optional, Sequence

from acp import (
    PROTOCOL_VERSION,
    Agent,
    Client,
    RequestError,
    spawn_agent_process,
    text_block,
)
from acp.schema import AgentMessageChunk, DeniedOutcome, RequestPermissionResponse

from server.errors import ConfigurationError, TransientError

DEFAULT_RETRY_DELAYS = (1.0, 2.0, 4.0)  # 3 attempts at 1s, 2s, 4s
PROMPT_TIMEOUT = 600.0  # seconds, matches the OpenRouter client

# provider id -> (executable, [args]) used to launch the agent in ACP mode.
# All are Node-based; Claude/Codex go through a separate ACP adapter package.
PROVIDER_LAUNCH: dict[str, tuple[str, list[str]]] = {
    "claude-code": ("npx", ["-y", "@agentclientprotocol/claude-agent-acp"]),
    "codex": ("npx", ["-y", "@zed-industries/codex-acp"]),
    "gemini": ("gemini", ["--experimental-acp"]),
    "qwen": ("qwen", ["--acp"]),
}

_PROVIDER_NAMES = {
    "claude-code": "Claude Code (Claude Max)",
    "codex": "Codex (ChatGPT Plus)",
    "gemini": "Gemini CLI (Gemini AI Pro)",
    "qwen": "Qwen Code",
}

# Base CLI used only to detect whether a provider is plausibly available. The Claude/Codex
# adapters wrap (and require) the base CLI, so its presence is a good-enough proxy.
_DETECT_CMD = {
    "claude-code": "claude",
    "codex": "codex",
    "gemini": "gemini",
    "qwen": "qwen",
}

# Static catalog in OpenRouter's model-object shape so the existing model picker and
# client/src/lib/modelDisplay.ts render it unchanged ("$0/$0" => "free"). Ids are
# provider/model so the frontend's id.split("/") still yields a provider badge.
_CATALOG: list[tuple[str, str, int]] = [
    ("claude-code/opus", "Claude Code — Opus", 200_000),
    ("claude-code/sonnet", "Claude Code — Sonnet", 200_000),
    ("claude-code/haiku", "Claude Code — Haiku", 200_000),
    ("gemini/gemini-2.5-pro", "Gemini 2.5 Pro", 1_000_000),
    ("gemini/gemini-2.5-flash", "Gemini 2.5 Flash", 1_000_000),
    ("gemini/gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite", 1_000_000),
    ("codex/default", "Codex (ChatGPT)", 256_000),
    ("qwen/default", "Qwen Code", 256_000),
]

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


def model_catalog() -> list[dict]:
    """Return the routable models as OpenRouter-shaped objects (zero pricing)."""
    return [
        {
            "id": mid,
            "name": name,
            "context_length": ctx,
            "pricing": {"prompt": "0", "completion": "0"},
            "supported_parameters": [],
        }
        for mid, name, ctx in _CATALOG
    ]


def detect_providers() -> list[dict]:
    """Best-effort detection of which provider CLIs are installed on PATH."""
    return [
        {
            "id": pid,
            "name": _PROVIDER_NAMES[pid],
            "detected": shutil.which(_DETECT_CMD[pid]) is not None,
        }
        for pid in PROVIDER_LAUNCH
    ]


def _subprocess_env() -> dict[str, str]:
    """os.environ with common Node/npm-global bin dirs prepended to PATH.

    Fixes the case where the server is launched from a shell whose PATH lacks the
    npm-global bin even though the CLI is installed.
    """
    env = dict(os.environ)
    extra = [
        p
        for p in (
            "/usr/local/bin",
            "/opt/homebrew/bin",
            os.path.expanduser("~/.npm-global/bin"),
            os.path.expanduser("~/.local/bin"),
        )
        if os.path.isdir(p)
    ]
    if extra:
        env["PATH"] = os.pathsep.join([*extra, env.get("PATH", "")])
    return env


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


def split_model(model: str) -> tuple[str, str]:
    """Split a 'provider/model' id into (provider, model_arg). Tolerates a bare provider."""
    provider, _, model_arg = model.partition("/")
    return provider, model_arg


class _StreamingClient(Client):
    """ACP client that denies all tools and forwards streamed assistant text.

    A single instance is reused per connection; ``on_text`` is swapped in for the duration
    of each turn (turns are serialized per connection, so this is safe).
    """

    def __init__(self) -> None:
        self.on_text: Optional[Callable[[str], None]] = None

    async def request_permission(self, options, session_id, tool_call, **kwargs):  # type: ignore[override]
        # Pure text transform: never let the coding agent run a tool.
        return RequestPermissionResponse(outcome=DeniedOutcome(outcome="cancelled"))

    async def session_update(self, session_id, update, **kwargs):  # type: ignore[override]
        if isinstance(update, AgentMessageChunk) and self.on_text is not None:
            text = getattr(update.content, "text", None)
            if isinstance(text, str) and text:
                self.on_text(text)


@dataclass
class _Conn:
    connection: Agent  # acp ClientSideConnection (implements the Agent interface)
    proc: object  # asyncio subprocess.Process
    client: _StreamingClient
    lock: asyncio.Lock


class AcpConnectionManager:
    """Lazy pool of one persistent ACP connection per provider."""

    def __init__(self) -> None:
        self._stack = AsyncExitStack()
        self._conns: dict[str, _Conn] = {}
        self._spawn_lock = asyncio.Lock()
        self._cwd = tempfile.mkdtemp(prefix="translate-acp-")

    def _alive(self, conn: _Conn) -> bool:
        return getattr(conn.proc, "returncode", None) is None

    async def get(self, provider: str) -> _Conn:
        if provider not in PROVIDER_LAUNCH:
            raise ConfigurationError(f"Unknown provider: {provider}")
        existing = self._conns.get(provider)
        if existing is not None and self._alive(existing):
            return existing
        async with self._spawn_lock:
            existing = self._conns.get(provider)
            if existing is not None and self._alive(existing):
                return existing
            conn = await self._spawn(provider)
            self._conns[provider] = conn
            return conn

    async def _spawn(self, provider: str) -> _Conn:
        cmd, args = PROVIDER_LAUNCH[provider]
        executable = shutil.which(cmd) or cmd
        # Base Client methods have empty bodies (fs/terminal ops we never advertise), so
        # the type checker treats them as abstract; instantiation is verified safe.
        client = _StreamingClient()  # type: ignore[abstract]
        try:
            connection, proc = await self._stack.enter_async_context(
                spawn_agent_process(client, executable, *args, env=_subprocess_env())
            )
            await connection.initialize(protocol_version=PROTOCOL_VERSION)
        except Exception as exc:  # noqa: BLE001 - normalize to our error taxonomy
            raise _classify(exc) from exc
        return _Conn(connection=connection, proc=proc, client=client, lock=asyncio.Lock())

    @staticmethod
    def _resolve_model(model_arg: str, models_state) -> Optional[str]:
        """Map a requested model name to one the agent actually exposes, if any."""
        if not model_arg or model_arg == "default" or models_state is None:
            return None
        available = getattr(models_state, "available_models", None) or []
        low = model_arg.lower()
        for m in available:  # exact id match first
            if getattr(m, "model_id", None) == model_arg:
                return m.model_id
        for m in available:  # then substring on id or display name
            mid = (getattr(m, "model_id", "") or "").lower()
            name = (getattr(m, "name", "") or "").lower()
            if low in mid or low in name:
                return m.model_id
        return None

    async def run_turn(
        self,
        *,
        provider: str,
        model_arg: str,
        payload: str,
        on_token: Optional[Callable[[str], None]],
    ) -> str:
        conn = await self.get(provider)
        async with conn.lock:
            parts: list[str] = []

            def sink(chunk: str) -> None:
                parts.append(chunk)
                if on_token is not None:
                    on_token(chunk)

            conn.client.on_text = sink
            try:
                session = await conn.connection.new_session(cwd=self._cwd)
                sid = session.session_id
                target = self._resolve_model(model_arg, getattr(session, "models", None))
                if target is not None:
                    try:
                        await conn.connection.set_session_model(model_id=target, session_id=sid)
                    except Exception:  # noqa: BLE001 - model switch is best-effort
                        pass
                await asyncio.wait_for(
                    conn.connection.prompt(prompt=[text_block(payload)], session_id=sid),
                    timeout=PROMPT_TIMEOUT,
                )
            except (ConfigurationError, TransientError):
                raise
            except asyncio.TimeoutError as exc:
                raise TransientError(f"agent timed out after {PROMPT_TIMEOUT:.0f}s") from exc
            except Exception as exc:  # noqa: BLE001
                raise _classify(exc) from exc
            finally:
                conn.client.on_text = None
            return "".join(parts)

    async def aclose(self) -> None:
        await self._stack.aclose()
        self._conns.clear()


# Process-global pool shared across requests; closed on app shutdown.
_MANAGER: Optional[AcpConnectionManager] = None


def get_manager() -> AcpConnectionManager:
    global _MANAGER
    if _MANAGER is None:
        _MANAGER = AcpConnectionManager()
    return _MANAGER


async def shutdown_manager() -> None:
    global _MANAGER
    if _MANAGER is not None:
        await _MANAGER.aclose()
        _MANAGER = None


class AcpProviderClient:
    """Drop-in replacement for OpenRouterClient backed by ACP agents."""

    def __init__(self, manager: Optional[AcpConnectionManager] = None) -> None:
        self._manager = manager or get_manager()

    async def list_models(self) -> list[dict]:
        return model_catalog()

    async def chat(
        self,
        *,
        model: str,
        system: str,
        user: str,
        retry_delays: Sequence[float] = DEFAULT_RETRY_DELAYS,
        on_retry=None,  # callable(attempt:int, total:int)
        on_token: Optional[Callable[[str], None]] = None,
    ) -> str:
        provider, model_arg = split_model(model)
        # ACP prompts carry user content only; fold our editor/reviewer template in.
        payload = f"{system}\n\n---\n\n{user}"
        total = len(retry_delays)
        last_exc: Optional[Exception] = None
        for attempt, delay in enumerate(retry_delays, start=1):
            if attempt > 1 and on_retry is not None:
                on_retry(attempt, total)
            try:
                return await self._manager.run_turn(
                    provider=provider,
                    model_arg=model_arg,
                    payload=payload,
                    on_token=on_token,
                )
            except ConfigurationError:
                raise  # user must act; retrying won't help
            except TransientError as exc:
                last_exc = exc
                if attempt < total:
                    await asyncio.sleep(delay)
                    continue
                raise
        raise last_exc or TransientError("retry loop exited without result")
