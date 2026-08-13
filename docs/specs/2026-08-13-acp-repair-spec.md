# ACP Provider Path — Repair Specification

**Date:** 2026-08-13
**Input:** [docs/reviews/2026-08-13-code-review.md](../reviews/2026-08-13-code-review.md) (10 confirmed findings + verified cleanup items)
**Scope:** `server/acp_providers.py`, `server/routes/chapters.py`, `server/sse.py`, `server/config.py`, `server/rounds.py`, the OpenRouter remnants, and the client stream/settings views.

## Goal

Make the ACP subscription-routing path (the engine behind the Editor → Reviewer → Editor translation rounds) robust under failure: no corrupted round output, no indefinite hangs, correct retry policy, honest provider detection, no silent model substitution, and no resource leaks. Remove the dead OpenRouter path entirely rather than patching it.

## Design decisions

1. **Delete the OpenRouter path.** `OpenRouterClient` has zero live callers; keeping it means maintaining a second `chat()` signature that is already broken (`on_token` TypeError). The smoke test is ported to the ACP client. The `openrouter_api_key` config field is dropped (pydantic ignores the stale field in existing `~/.translate/config.json` files, so old configs load cleanly).
2. **A timed-out connection is never reused.** Guaranteeing that a still-streaming abandoned turn can't contaminate a retry requires two independent defenses: session-id filtering on incoming chunks, and discarding (cancel best-effort, then kill) the connection on prompt timeout so the retry spawns fresh.
3. **Every awaited connection operation gets a timeout.** `prompt` keeps 600s; spawn+`initialize` get 120s (npx may download an adapter on first use); `new_session`/`set_session_model`/`close_session`/`cancel` get 60s/5s. One global spawn lock becomes one lock per provider.
4. **Classification policy:** rate limit / quota → `TransientError` (retryable, matching `server/errors.py`); missing executable (`FileNotFoundError`) → `ConfigurationError` detected by exception type, not substring; the `"not found"`/`"enoent"` substrings are removed from the config-error hint list (they misfire on "session not found").
5. **Detection must probe what launch uses.** `detect_providers()` resolves binaries against `_subprocess_env()['PATH']` (the env actually used to spawn) and requires *all* binaries a launch needs (`npx` **and** `claude` for claude-code, etc.).
6. **Preflight validates the requested provider,** not "any provider," and its error message accounts for stale OpenRouter-era model ids in saved defaults.
7. **No silent substitution:** when the requested model can't be selected, publish a visible status event naming what happened.
8. **Token streaming is coalesced server-side** (~300 chars per event) and SSE queues are bounded (drop-oldest at 1000). The client memoizes the paragraph diff.
9. **File-versioning convention:** documentation files follow the side-by-side convention (a revision of `USING_YOUR_SUBSCRIPTIONS..._v2.md` is written as `_v3.md`). Git-tracked source files are edited in place, matching this repo's established precedent (no `_v#` source files exist; git history is the version record).

## Requirements

Each requirement maps to a review finding (F#) or cleanup item (C#).

### R1 — No cross-turn output contamination (F1)
- `_StreamingClient` forwards an `AgentMessageChunk` only when its `session_id` equals the session id of the currently active turn.
- On prompt timeout: best-effort `connection.cancel(session_id=...)` (5s cap), then the connection is discarded (process killed, per-connection resources closed, removed from the pool). The retry spawns a fresh connection.

### R2 — No indefinite hangs, no cross-provider wedging (F2)
- `spawn_agent_process` entry + `initialize` complete within `SPAWN_TIMEOUT = 120.0` seconds or raise `TransientError`.
- `new_session` completes within `SESSION_TIMEOUT = 60.0` seconds or the connection is discarded and `TransientError` raised.
- The single `_spawn_lock` is replaced by one `asyncio.Lock` per provider; a hung spawn of one provider must not block another provider's spawn.

### R3 — Correct error classification (F3)
- `_classify(FileNotFoundError)` → `ConfigurationError` naming the missing executable.
- Messages containing "rate limit" or "quota" → `TransientError` (retried).
- `"not found"` and `"enoent"` are removed from `_CONFIG_ERROR_HINTS`.
- Auth/sign-in/credential/usage-limit hints remain `ConfigurationError`.

### R4 — Detection matches launch (F4)
- `detect_providers()` uses `shutil.which(binary, path=_subprocess_env()["PATH"])`.
- Per-provider required binaries: claude-code → `claude` and `npx`; codex → `codex` and `npx`; gemini → `gemini`; qwen → `qwen`. Detected = all present.
- `_spawn` resolves its executable against the same PATH.

### R5 — Preflight names the real problem (F5)
- A new `require_provider(model: str) -> str` in `server/acp_providers.py` raises `ConfigurationError` when (a) the model's provider isn't in `PROVIDER_LAUNCH` — message lists valid providers and notes the model may be a stale saved default — or (b) the provider isn't detected — message names the provider CLI to install.
- `_make_client` in `server/routes/chapters.py` takes the requested model and calls `require_provider` before any event is published.

### R6 — No silent model substitution (F6)
- `run_turn`/`chat`/`run_editor_pass`/`run_reviewer_pass` accept an optional `on_notice(text: str)` callback.
- When `_resolve_model` finds no match for an explicitly requested model, or `set_session_model` fails, `on_notice` is called with a human-readable explanation; the chapter routes publish it as a `status` event (`phase: "notice"`) so it appears in the activity log.

### R7 — OpenRouter path removed (F7, C1)
- Deleted: `server/openrouter.py`, `tests/server/test_openrouter.py`.
- `Config.openrouter_api_key` removed; `/settings` GET/PUT no longer carry it; client `Settings` type and `SettingsRoute` no longer reference it.
- `tests/server/test_e2e_smoke.py` rewritten against `AcpProviderClient`, gated on `TRANSLATE_E2E_MODEL` (e.g. `claude-code/sonnet`).
- `server/errors.py` docstrings no longer reference OpenRouter.
- Stale placeholder model ids in the UI (`anthropic/claude-sonnet-4`, `openai/gpt-5`) replaced with catalog ids.

### R8 — Stream pane shows only this chapter's current attempt (F8)
- `ChapterRoute` appends `token` events to the stream only when `e.chapter === n`.
- The stream resets on `phase === "sent"` **and** `phase === "retry"` (for this chapter), and clears on this chapter's `round_complete`/`error`.

### R9 — Event volume bounded (F9)
- Server: a `_TokenCoalescer` buffers streamed chunks and publishes one `token` event per ~300 chars, flushed after the pass completes (success or failure).
- `EventBus.subscribe` queues get `maxsize=1000`; `publish` drops the oldest event instead of growing unboundedly.
- Client: `DiffView` computes `diffParagraphs` inside `useMemo`.

### R10 — Resource lifecycle (F10)
- Each `_Conn` owns its own `AsyncExitStack`; a failed `initialize` closes that stack (terminating the subprocess) before the error propagates.
- Replacing a dead connection discards the old one (kill + stack close).
- `close_session` is called best-effort after each successful turn.
- `aclose()` discards every connection and removes the `translate-acp-*` temp directory.

### R11 — Cleanup (C2–C5)
- `AcpProviderClient.list_models` deleted (unused; `/models` uses `model_catalog()`).
- Dead `raise last_exc or ...` tail in `chat()` replaced with an explicit raise.
- `client_with(monkeypatch)` fixture drops the unused parameter.
- `useModels`/`useProviders` reimplemented over a shared `useFetch<T>` hook (memoized `refresh`).
- `SettingsRoute.handleRefreshModels` loses the unreachable try/catch and no-op `refreshing` state; the button's busy state derives from the hooks' `loading` flags.
- The duplicated `on_retry`/`on_token` publisher lambdas in `server/routes/chapters.py` are factored into one helper used by both routes.

### R12 — Documentation
- `USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER_v3.md` created (side-by-side versioning; v2 untouched) documenting: the config field removal, detection semantics, timeout/retry behavior, and the smoke-test change.

## Non-goals

- No migration rewriting of `~/.translate/config.json` (stale default models surface through the R5 error message; pydantic drops the removed key on next save).
- No client-side token batching beyond the server coalescing.
- No change to prompt templates, payload format, or the round state machine.

## Acceptance verification

- `.venv/bin/python -m pytest tests/server -q` passes.
- `cd client && npm test` passes and `npm run build` compiles.
- `grep -ri openrouter server/ client/src/ tests/` returns only historical references in docs (none in code).
- Manual: with only one provider CLI installed, requesting a model from an uninstalled provider returns HTTP 400 naming that provider before any `sent` event.
