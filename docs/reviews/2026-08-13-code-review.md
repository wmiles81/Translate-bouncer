# Code Review — 2026-08-13

**Scope:** the ACP subscription-routing change (`be78c06` — "feat: route Editor/Reviewer rounds through AI subscriptions via ACP") verified against the live tree. Multi-angle review (line-scan, removed-behavior audit, cross-file trace, simplification, reuse, efficiency, conventions) with every candidate finding adversarially verified before inclusion. All findings below came back **CONFIRMED**.

**TL;DR:** the ACP path works in the happy case, but its error handling, timeouts, and lifecycle management have serious gaps. The two most dangerous problems are (1) a timed-out turn contaminating the retry's output — corrupting saved round files — and (2) a hung spawn wedging every provider behind a single global lock. The still-shipped OpenRouter path is now broken outright (its documented smoke test fails with a `TypeError`), so it should be fixed or deleted.

---

## Findings (ranked by severity)

### 1. Timed-out turn contaminates the retry's output — corrupted round files

`server/acp_providers.py:183`

`_StreamingClient.session_update` ignores `session_id`, and no `session/cancel` is ever sent. When a chapter round exceeds the 600s `asyncio.wait_for` on `prompt()`, the wait is cancelled but the agent keeps streaming (verified: acp 0.10.0's `prompt()` has no `CancelledError` handling, and `connection.cancel()` is never called). `chat()` classifies this as transient and retries on the same persistent connection (`_alive` only checks `proc.returncode`), so the new sink receives late chunks from the abandoned session interleaved with the new session's output. **Result: `round-N-editor.docx` is saved as a garble of two different generations with no error surfaced.**

**Fix direction:** send `session/cancel` on timeout, and have the sink filter chunks by `session_id`.

### 2. Unbounded `initialize`/`new_session` under a single global lock — one hung spawn wedges everything

`server/acp_providers.py:234` (and `new_session` at line 275)

Only `prompt()` gets the 600s timeout; `connection.initialize` and `new_session` are unbounded, and `initialize` runs while holding the single manager-wide `_spawn_lock` shared by all four providers. First Claude/Codex use runs `npx -y @agentclientprotocol/claude-agent-acp`; if npx stalls downloading (offline/slow network) or the adapter waits for interactive auth, `initialize` blocks forever holding the lock. The `POST /round/editor` request hangs indefinitely (uvicorn has no request timeout) and first-spawns of every other provider queue behind it. Recovery requires a client disconnect or server restart.

**Fix direction:** timeout on every awaited connection operation; per-provider locks.

### 3. Error classification is wrong in both directions

`server/acp_providers.py:94`

`_classify`'s substring taxonomy misroutes errors two ways:

- **Retryable treated as permanent:** "rate limit" / "quota" / "not found" map to `ConfigurationError`, which is never retried. This inverts the old client's behavior (`openrouter.py:75-79` retried HTTP 429 with backoff) and contradicts `server/errors.py:15`, which still documents rate limits as "Subject to retry." An overnight batch that hits a momentary rate limit gets HTTP 400 "fix your configuration" instead of a 1s backoff. Transient agent errors containing "not found" (e.g. "session not found") are also permanently blocked.
- **Permanent treated as retryable:** `str(FileNotFoundError)` is `[Errno 2] No such file or directory: 'npx'` — matching neither the "not found" nor "enoent" hints — so a binary that will never appear is respawned 3 times with sleeps and surfaces as a 502 "transient" errno string.

### 4. Provider detection and process launch use different environments

`server/acp_providers.py:123`

`detect_providers()` probes the server's unmodified `PATH` (and the base CLI rather than the npx adapter actually launched), while spawning uses the augmented `_subprocess_env`. The repo ships a double-clickable `Translate.zip`; launched from Finder, the server `PATH` is `/usr/bin:/bin:...` while the CLIs live in `/opt/homebrew/bin` — so detection reports all four providers "not found" and every round is rejected with "No AI CLI detected," even though the spawn itself would have succeeded. The inverse also holds: a native (non-npm) Claude install has `claude` but no `npx` → detected, yet every round fails at spawn.

**Fix direction:** run `which()` against `_subprocess_env()['PATH']` and probe what launch actually needs.

### 5. Preflight guard checks the wrong provider; stale model IDs never validated

`server/routes/chapters.py:43`

`_make_client` passes if **any** provider CLI is detected, not the provider named in `req.model`, and persisted OpenRouter-era model IDs (e.g. `anthropic/claude-sonnet-4`, which existing configs and repo fixtures still contain) are never migrated or validated upfront. With only gemini installed, picking `claude-code/opus` — or keeping a stale default that `ChapterRoute` prefills — passes the guard, publishes the "sent" event, then dies mid-flight with either `400 Unknown provider: anthropic` (naming neither the stale default nor valid choices) or three retried npx `FileNotFoundError`s ending in a 502.

**Fix direction:** validate `split_model(req.model)[0]` specifically, upfront, with an error naming the problem.

### 6. Silent model substitution

`server/acp_providers.py:277`

When `_resolve_model` finds no match, `set_session_model` is skipped with no log or event, and even a failed `set_session_model` is swallowed by `except: pass`. If the hardcoded `_CATALOG` drifts (an agent version renames `gemini-2.5-pro`), the user who picked "Gemini 2.5 Pro" as Editor silently gets the agent's current default model for every round — quietly changing translation quality with no indication anywhere (the module imports no logging; the diff contains zero logging).

**Fix direction:** publish a status/SSE warning naming the substitute (`session.models.current_model`).

### 7. The still-shipped OpenRouter path is broken

`server/rounds.py:100`

`run_editor_pass`/`run_reviewer_pass` now pass `on_token=` unconditionally to `client.chat()`, but `OpenRouterClient.chat` has no such parameter. The documented pre-release smoke test (`OPENROUTER_API_KEY=... pytest tests/server/test_e2e_smoke.py`) now fails immediately with `TypeError: chat() got an unexpected keyword argument 'on_token'`. Either update the signature or delete the dead OpenRouter path outright (see cleanup section — deletion is the better move).

### 8. Live stream pane mixes chapters and retries

`client/src/views/ChapterRoute.tsx:78`

The stream pane appends token events from **any** chapter (`e.chapter` is never compared to the route's chapter) and is only reset on `phase === 'sent'`, not on retry. `BatchControls.runBatch` loops rounds across chapters, so while viewing chapter 3, chapter 7's output streams into chapter 3's preview as bare unlabeled text; two tabs interleave into one garbled buffer; and a retried attempt appends attempt 2's tokens directly after attempt 1's partial output.

**Fix direction:** filter `e.chapter === n` and clear the buffer on `phase === 'retry'`.

### 9. Per-token event firehose — unbounded queues and full re-renders

`server/routes/chapters.py:143`

Every streamed chunk becomes one `EVENT_BUS` event, JSON-serialized per subscriber into unbounded `asyncio.Queue`s (`server/sse.py:13` uses `put_nowait`; a slow SSE consumer accumulates the whole token firehose in memory during long batch runs). On the client, each chunk is a separate `setStream` commit — a full re-render of `EnglishPane`/`WorkingPane` per token, plus `diffParagraphs` (an LCS over all paragraphs) re-running unmemoized in `DiffView` when the diff toggle is on.

**Fix direction:** coalesce chunks (flush every ~150ms / 512 chars), memoize the diff, bound the queues.

### 10. Connection/process lifecycle never cleans up

`server/acp_providers.py:231`

`AcpConnectionManager` releases nothing before shutdown. `spawn_agent_process` is entered on the manager-lifetime `AsyncExitStack` (which has no per-context exit), so if `initialize` raises on a live agent, the subprocess keeps running unreferenced — and a transient-classified init failure makes the retry loop spawn up to 3 orphans per round. `new_session` is called every turn but `close_session` (available in acp 0.10.0) never is — Claude Code persists a transcript per session in the shared temp cwd — and `aclose()` never removes the `mkdtemp` directory, abandoning `translate-acp-*` dirs on every run.

**Fix direction:** per-connection exit stack popped on failure/replacement; best-effort `close_session` per turn; clean up the cwd in `aclose()`.

---

## Lower-severity cleanup (verified, dropped by the 10-finding cap)

- **Dead code retained:** `server/openrouter.py` has zero live callers (only its own unit tests and the env-gated smoke test reference it); the `openrouter_api_key` config field survives only so `SettingsRoute.tsx:38` can round-trip a value nothing reads; `AcpProviderClient.list_models` is never called (routes use `model_catalog()` directly). Deleting the OpenRouter path also resolves finding 7.
- **`useProviders.ts`** is a byte-identical clone of `useModels.ts` with unused `loading`/`error` returns and an un-memoized `refresh` (deviating from the repo's own `useCallback` convention). A shared `useFetch<T>(fetcher)` would cover both.
- **`SettingsRoute.tsx` `handleRefreshModels`:** the try/catch wraps synchronous fire-and-forget calls, so `refreshError` and the `refreshing` flag are unreachable-by-construction leftovers of the deleted save-key flow.
- **Duplicated event lambdas:** the `on_token` and `on_retry` publisher blocks in `server/routes/chapters.py` are copy-pasted between the editor and reviewer routes; the event shape now lives in two places.
- **Dead variable:** in `AcpProviderClient.chat`, the trailing `raise last_exc or TransientError(...)` is reachable only when `retry_delays` is empty, where `last_exc` is provably `None`.

## Conventions check

No CLAUDE.md violations: the `USING_YOUR_SUBSCRIPTIONS...` v1/v2 doc pair follows the required side-by-side versioning convention, and no annotation sidecars exist in the tree.
