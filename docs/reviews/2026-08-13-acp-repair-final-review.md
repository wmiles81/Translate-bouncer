# Final Whole-Branch Review — acp-repair (be78c06..8a83435)

Reviewer: Senior Code Reviewer (final gate). Scope: cross-task interactions, whole-spec coverage, production readiness. Per-task reviews already gated each task; this review focuses on what those gates could not see.

## Strengths

- **The two-defense contamination design composes correctly end to end.** I traced the full retry path: prompt timeout → best-effort `cancel` (5s cap) → `_discard` (pool pop → kill → stack close) → `TransientError` → `chat()` sleeps → `run_turn` → `get()` finds no pooled conn → fresh spawn with a **new** `_StreamingClient`. A late chunk from the abandoned turn can only reach the old, discarded client, and even during the 5s cancel window it can only land in the abandoned attempt's local `parts` list, which is thrown away. The retry's session gets a new session id, so the session-id filter catches anything that somehow survives. No path exists where a discarded connection's output reaches attempt 2's returned text.
- **Lock composition is clean.** Only two lock kinds exist (`_spawn_locks[provider]`, `conn.lock`) and no code path holds both while awaiting the other; `_discard` takes no locks and is idempotent (pool-identity check, `_alive` guard, `AsyncExitStack.aclose()` is a no-op on second call), so the concurrent double-timeout case is safe. The hung-spawn-doesn't-block-other-providers property is directly tested.
- **Spec coverage is complete.** All of R1–R12 have corresponding implementation *and* tests: R1 (`test_prompt_timeout_cancels_and_discards_the_connection`, `test_streaming_client_ignores_chunks_from_other_sessions`), R2 (per-provider locks + `test_hung_initialize_times_out_and_does_not_block_other_providers`), R3 (`test_classify_policy` covers the "session not found" trap explicitly), R4 (detection probes the augmented spawn PATH, negative + positive cases), R5 (`require_provider` + route test with a stale `anthropic/...` id → 400 before any event), R6 (notice plumbed through `chat`/round passes with a test), R7 (grep confirms zero live OpenRouter code; the 5 residual hits are absence-assertions in tests), R8 (chapter filter + retry reset, tested at the ChapterRoute level with a fake EventSource), R9 (coalescer, bounded drop-oldest queue with a precise 1100→1000 test, `useMemo`), R10 (per-conn `AsyncExitStack`, kill-on-discard, `close_session` best-effort, `aclose` removes the temp dir — all tested), R11, R12.
- **Production configs are handled.** A stale `~/.translate/config.json` with `openrouter_api_key` loads cleanly (tested), the key disappears on next save, and a stale saved default model produces an HTTP 400 that names the provider, lists valid ones, and explains the stale-default possibility. That is exactly the actionable error the spec asked for.
- **The `useEvents` latest-ref fix is the standout catch of the branch** — the plan's remount assumption was wrong, the implementer noticed, fixed it properly, and added a regression test documenting *why* (params-only navigation doesn't remount the route element). The stale-chapter-filter bug would have silently defeated R8.
- **Test discipline is high.** The fake ACP layer (`_FakeAcpConnection`/`_fake_spawn`) tests real lifecycle behavior (kill via proc.returncode, cancel recording, closed-session recording) rather than mocking outcomes.

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

1. **`_TokenCoalescer` buffer survives across retry attempts, partially defeating R8's "never concatenates with its retry's" guarantee** — `server/routes/chapters.py`.
   The coalescer is created once per route call and shared across all of `chat()`'s internal retry attempts, but nothing clears it on retry. If attempt 1 streams tokens and then fails with a `TransientError` mid-stream (e.g. connection drop after partial output), up to 299 buffered chars from attempt 1 remain in `_buf`. The client correctly resets its stream pane on the `retry` status event (Task 11), but the server then publishes those stale chars as the prefix of attempt 2's first coalesced `token` event — reintroducing exactly the cross-attempt display bleed R8 set out to eliminate, from the other side of the pipe. The in-code comment in `ChapterRoute.tsx` ("a failed attempt's partial output never concatenates with its retry's") is currently not quite true.
   Same-family ordering blemish: on failure the routes publish the `error` event inside the `except` block, and the `finally: on_token.flush()` runs *after* it — so the tail `token` event arrives after the `error` event that cleared the client's stream pane, leaving stale text in the pane until the next `sent`.
   **Fix (small):** give the coalescer a `reset()` (clear buffer, no publish) and call it from `on_retry`; and in the routes, flush (or reset) the coalescer *before* publishing the `error` event rather than relying solely on `finally`. Display-only, bounded to <300 chars, failure-corner only — but it is a composed-behavior gap between Task 9 and Task 11 that the task-scoped gates couldn't see, and the fix is ~6 lines.

### Minor (Nice to Have)

2. **Client `Phase` type is missing `"notice"`** — `client/src/types/api.ts` declares `Phase = "sent" | "returned" | "retry"`, but the server now publishes `phase: "notice"` (R6, `_round_callbacks.on_notice`). Runtime is unaffected (notices fall through to `appendActivity`, which is the intended behavior), but the typed contract has drifted: any future `switch` on `phase` will be built against an incomplete union. One-word fix.
3. **Timeout misattribution in `run_turn`** (already in the deferred ledger, Task 4): the single `except asyncio.TimeoutError` catches both `new_session`'s 60s timeout and `prompt`'s 600s timeout, and the message always claims `"agent timed out after 600s"`. A wedged `new_session` will be mislabeled in the activity log and any bug report. Track which stage was in flight, or word the message neutrally.
4. **Every turn on a provider that doesn't advertise `available_models` publishes a "model not exposed" notice.** For an explicit model like `claude-code/opus`, if the adapter returns `session.models = None`, `_resolve_model` returns None and `on_notice` fires on *every* turn — truthful per R6 (no silent substitution), but a 20-chapter batch will log 40+ identical notices. Consider de-duplicating per provider per process, or downgrading the wording once acknowledged.
5. **Spec-inherited, verify once manually:** R4 mandates that claude-code detection requires both `claude` and `npx` (and codex requires `codex` + `npx`). If either ACP adapter package actually bundles its engine rather than shelling out to the base CLI, detection is stricter than launch and a launchable provider could read "not installed." The implementation matches the spec exactly, so this is a note against the spec's assumption, not the code — the acceptance criteria's manual single-CLI check will confirm or refute it.

## Deferred-Findings Triage

**None block merge.** Reviewing all 13 deferred minors in the ledger:
- Task 4's timeout-message misattribution (item 3 above) is the only one with user-visible diagnostic impact; it's a small, safe post-merge fix.
- Task 2's "no positive detection test" is now substantially covered (`test_detection_probes_the_spawn_path...` asserts `gemini → True`).
- Task 10's useFetch doc note is already satisfied (the stable-fetcher comment exists in `useFetch.ts`).
- Task 9's pre-existing `tsc -b` TS6310 project-reference error predates the branch and is correctly ticketed as follow-up.
- The rest (docstring paren, `exc.filename` repr, `env.get("PATH")` fallback, shutdown-only lock gaps, test-assertion strength) are genuine polish.
- Both rulings (Task 8's grep-vs-absence-assertion, Task 14's in-flight-revision amendment) are sound; the 5 residual "openrouter" grep hits are all test names/assertions proving absence, which honors the spec's intent.

## Recommendations

1. Before merge: apply the coalescer `reset()`-on-retry + flush-before-error-event fix (Issue 1) and add `"notice"` to the `Phase` union (Issue 2). Both are tiny and squarely within this branch's charter.
2. Post-merge follow-ups, in priority order: timeout-stage attribution (Issue 3), notice de-duplication (Issue 4), the ticketed TS6310 build config issue.
3. During the spec's manual acceptance check (single CLI installed), also confirm Issue 5 — that a machine with the claude adapter working but detection requiring `claude` doesn't produce a false "not installed."

## Assessment

**Ready to merge?** With fixes

**Reasoning:** The branch delivers all twelve requirements with genuinely strong failure-path engineering and tests, and nothing found rises above display-level severity — but the coalescer's retry-buffer bleed (Issue 1) is a small composed-behavior gap that contradicts R8's stated guarantee, and since the fix is a few lines it should land on this branch rather than ship as a known regression of the branch's own goal.
