# Rounds: Draft, Review, Revise

A **round** is the unit of editing work a user requests. One round = three model calls:

1. **Editor draft** — rewrite the working document.
2. **Reviewer** — read the draft, return JSON suggestions.
3. **Editor revise** — apply this round's suggestions.

All three belong to the **same round number**. Asking for one round produces round 1, not round 2.

## Contents

- [Why this matters (the counter bug)](#why-this-matters-the-counter-bug)
- [The apply pass](#the-apply-pass)
- [Files a completed round leaves](#files-a-completed-round-leaves)
- [Which document is "current"](#which-document-is-current)
- [The leading-editor skip](#the-leading-editor-skip)

## Why this matters (the counter bug)

Before 2026-08-14 the counter incremented on **every editor pass**, so a round consumed two round numbers and three requested rounds displayed as "round 4". The fix keeps the apply pass inside its round.

## The apply pass

`POST /round/editor` takes `apply_suggestions: bool = False`:

- **`false`** — opens a new round: `next_round = current_round + 1`, writes `round-N-editor.*`, appends a `RoundEntry`, advances `current_round`.
- **`true`** — stays in the current round: writes `round-N-editor-revised.*`, sets `revised_completed_at` on the existing entry, and **leaves `current_round` alone**.

Applying with no suggestions on the current round is rejected with HTTP 400 (`no reviewer suggestions to apply for round N`) rather than silently doing a no-op edit.

Client callers pass the flag positionally:

```ts
runEditorRound(slug, n, editorModel, signal, true);   // the apply pass
```

## Files a completed round leaves

```
round-1-editor.docx        draft (pre-review) — never overwritten
round-1-editor.json
round-1-editor.raw.txt     raw model reply, written before parsing
round-1-reviewer.json      {model, suggestions[], raw_response}
round-1-editor-revised.docx    post-review text for this round
round-1-editor-revised.json
round-1-editor-revised.raw.txt
```

The `RoundEntry` in `chapters/chNN/meta.json` mirrors that:

```json
{ "n": 1,
  "editor_completed_at": "...",
  "reviewer_completed_at": "...",
  "revised_completed_at": "..." }
```

A round with all three timestamps is complete. Missing `revised_completed_at` means the round was interrupted between review and apply.

## Which document is "current"

`_round_doc_path(slug, n, round_n)` in `server/routes/chapters.py` prefers `round-N-editor-revised.json`, falling back to `round-N-editor.json`. Three consumers depend on it:

- the next round's editor source (`_current_target_doc`)
- the reviewer's target
- `GET /chapter/{n}/docs` (working/previous panes)

`server/finalize.py` follows the same preference for `final.docx`, so **finalizing takes the post-review text** when a round has one.

> [!NOTE]
> This fallback is what keeps books created before the change working: their rounds have only drafts, and every consumer degrades to the draft automatically.

## Every round starts with a draft

Both callers — `runBatch` and Continue — run the three passes in order, always:

```ts
await runEditorRound(slug, n, editorModel, signal);          // draft (new round)
await runReviewerRound(slug, n, reviewerModel, signal);      // review
await runEditorRound(slug, n, editorModel, signal, true);    // apply, same round
```

There is deliberately **no resume**. An earlier version skipped the draft when
the current round already had an unreviewed editor pass, to avoid redoing work.
That made "Restore original" look broken: a run that had produced drafts and
then failed every review left 13 half-rounds, and the next batch silently
reviewed those stale drafts — opening each chapter's log at the Reviewer step
with text that could be hours old and from a different model.

The cost of always drafting is one extra editor call when a round was
interrupted mid-flight. The benefit is that what the log shows is what just
ran, and a restored book really does start from the original translation.
