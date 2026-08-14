# Connection Manager: Locks, Timeouts, Sessions

`AcpConnectionManager` in `server/acp_providers.py` owns every spawned agent process. It is a **process-global singleton** (`get_manager()`), closed by the app's lifespan hook via `shutdown_manager()`.

## Contents

- [Pool keys and per-provider locks](#pool-keys-and-per-provider-locks)
- [Spawning](#spawning)
- [Timeouts](#timeouts)
- [A turn, step by step](#a-turn-step-by-step)
- [Session-id filtering](#session-id-filtering)
- [Discarding a connection](#discarding-a-connection)

## Pool keys and per-provider locks

`_launch_plan(provider, model_arg)` returns `(pool_key, extra_args, spawn_pinned)`:

- Normally the key is just the provider id — one reused connection per provider.
- For codex with a real model, the key is `codex::<model>` and the launch gains `-c model="<model>"`, because the codex adapter cannot switch models in-session. Each picked codex model therefore gets its **own pooled connection, pinned at spawn**.

Spawn locks are **per provider** (`self._spawn_locks[provider]`), created eagerly in `__init__`. This matters: a single global lock meant one hung `npx` download blocked every provider's first use.

## Spawning

`_spawn()` resolves the executable against `_subprocess_env()["PATH"]` — the same augmented PATH used for the child process — then enters `spawn_agent_process(...)` on a **per-connection** `AsyncExitStack`. Closing that stack terminates the subprocess, so a failed init never leaks an orphan.

Two non-obvious launch details:

```python
transport_kwargs={"limit": STREAM_LIMIT}   # 8 MiB
```

ACP is newline-delimited JSON and agents emit single lines far beyond asyncio's 64 KiB default `StreamReader` limit (Claude Code's available-commands update is the usual culprit). Exceeding it raises `LimitOverrunError` and kills the connection with a bare **"Connection closed"** on every turn. This one line is why Claude rounds work at all.

```python
await connection._conn.send_request("initialize", {...explicit clientCapabilities...})
```

The SDK's typed `initialize()` serializes with `exclude_defaults`, dropping the default `ClientCapabilities` — and gemini's `--experimental-acp` hard-requires `clientCapabilities` (zod: Required) and answers `-32602 Invalid params`. There is no public dict-params path, so `_initialize()` goes through the underlying connection deliberately.

## Timeouts

| Constant | Value | Covers |
|----------|-------|--------|
| `SPAWN_TIMEOUT` | 120 s | context entry **and** `initialize` (npx may download an adapter on first use) |
| `SESSION_TIMEOUT` | 60 s | `new_session`, `set_session_model`, `close_session` |
| `PROMPT_TIMEOUT` | 600 s | the prompt itself |
| — | 5 s | best-effort `cancel` after a prompt timeout |
| — | 10 s | stack close during `_discard` |

Every awaited connection call is bounded. Before this, only `prompt` was, so a stalled spawn hung the request forever while holding the lock.

## A turn, step by step

`run_turn()`:

1. `get(provider, model_arg)` — reuse or spawn.
2. Acquire `conn.lock` (turns are serialized per connection).
3. `new_session(cwd=self._cwd)` under `SESSION_TIMEOUT`.
4. `begin_turn(session_id, on_text=sink)` arms the streaming client.
5. Unless the model was pinned at spawn, `_resolve_model()` + `set_session_model`; failures and unresolvable models fire `on_notice` rather than passing silently.
6. `prompt(...)` under `PROMPT_TIMEOUT`, accumulating chunks.
7. On success: best-effort `close_session`, return the joined text.
8. `finally: end_turn()` — always disarms the client.

## Session-id filtering

`_StreamingClient.session_update` drops any chunk whose `session_id` doesn't match the armed turn:

```python
if session_id != self.session_id or self.on_text is None:
    return
```

Without this, a timed-out turn that keeps generating would interleave its late chunks into the retry's reply and the saved `.docx` would be a garble of two generations, with no error surfaced.

## Discarding a connection

`_discard(key, conn)` pops the connection (identity-checked so it can't evict a fresher one), cancels the stderr reader task, kills the **whole process tree**, and closes the stack under a 10 s cap.

It runs when a prompt times out — after a best-effort `cancel(session_id)` — because a connection whose agent may still be generating **cannot be trusted for reuse**. The retry then spawns a fresh agent.

> [!WARNING]
> Kill the tree, not the process. An adapter launched through npx is three levels deep — `npm → node → codex-acp (Rust)` — and our handle is the top one. Killing only that reparents the Rust worker to init, where it keeps holding memory and a provider session. One day of testing accumulated **31 processes, 14 orphaned, ~1 GB**. `_kill_process_tree(proc)` walks `ps -eo pid=,ppid=`, kills descendants deepest-first, then the process itself.

`aclose()` discards every pooled connection and `rmtree`s the `translate-acp-*` temp cwd.
