# Batch Runner, Stopping, and Live Streaming

## Contents

- [The loop](#the-loop)
- [Two ways to stop](#two-ways-to-stop)
- [The activity log](#the-activity-log)
- [The live stream pane](#the-live-stream-pane)
- [Event handling](#event-handling)

## The loop

`client/src/lib/batchRunner.ts` — `runBatch(opts)` iterates chapters, then rounds:

```ts
for each chapter:
  for r in 1..roundsPerChapter:
    if needsLeadingEditor(state): state = await runEditorRound(...)        // draft
    await runReviewerRound(...)                                            // review
    state = await runEditorRound(..., signal, true)                        // apply
  if finalize: await finalizeChapter(...)
```

A chapter that throws is reported via `onProgress({type: "error"})` and the batch **continues to the next chapter** — one bad chapter doesn't abort a book. An aborted call is the exception: it ends the batch as `stopped`, not as an error.

`BatchRunModal` pre-fills Editor and Reviewer from `settings.default_models` once settings load (they're per-run overrides, not a second place to configure defaults).

## Two ways to stop

| Control | Mechanism | Effect |
|---------|-----------|--------|
| **Stop after current chapter** | `stopRef.current = true`, checked between chapters and rounds | finishes the chapter in flight, then stops |
| **Stop now** (red) | `AbortController.abort()` threaded through `request()` into `fetch` | abandons the in-flight round immediately |

On an abort the server sees the client disconnect and cancels the agent turn; the chapter stays at its **last saved round**, so nothing half-written lands. Both paths report "stopped by user" rather than an error.

> [!NOTE]
> `signal` reaches the network layer through `client/src/api/client.ts` → `runEditorRound/runReviewerRound/finalizeChapter`. If you add a new long-running call to the batch, thread the signal or "Stop now" won't cover it.

## The activity log

Fed from **two sources**: server SSE events (via `useEvents`) and the batch runner's own `onProgress` events. That's why you see both a `→ Editor` line (server) and a `Ch N: round r/R — calling editor…` line (runner).

Server-side text is built in `_round_callbacks()` and the route bodies in `server/routes/chapters.py`:

```
Ch 4 R1 → Reviewer (codex/gpt-5.5) · source: round 1 editor output
Ch 4 R1 ← Reviewer returned 48 suggestions
✓ Ch 4 R1 reviewer complete
```

> [!WARNING]
> Every stage currently logs **twice** at the same second — a `status`/`returned` line and a `round_complete` line saying the same thing. And the apply pass is logged identically to a draft pass, so a completed round shows two indistinguishable "Editor" entries. See Known Issues.

## The live stream pane

Token events are appended only for the chapter being viewed:

```ts
const mine = e.chapter === undefined || e.chapter === n;
```

The buffer resets on `phase === "sent"` **and** `phase === "retry"` (so a failed attempt's partial output never prefixes the retry), clears on this chapter's `round_complete`/`error`, and keeps a rolling 4000-character tail.

## Event handling

`useEvents(onEvent)` opens **one** `EventSource` for the app's lifetime and uses a latest-handler ref:

```ts
const handlerRef = useRef(onEvent);
handlerRef.current = onEvent;              // updated every render
es.onmessage = (ev) => handlerRef.current(JSON.parse(ev.data));
```

This is load-bearing. React Router does not remount `ChapterRoute` when only the `:n` param changes, so a mount-time closure would freeze the chapter filter at whichever chapter was open when the subscription started — switching chapters via the TopBar dropdown would then silently blank the stream pane.

## Related

<a href="#" data-goto="quirks:known-issues">→ Known Issues</a>
