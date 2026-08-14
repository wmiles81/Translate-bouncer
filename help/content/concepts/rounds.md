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

## The leading-editor skip

`needsLeadingEditor()` in `client/src/lib/batchRunner.ts`:

```ts
if (meta.current_round === 0) return true;
const last = meta.rounds.find((r) => r.n === meta.current_round);
return !last || last.reviewer_completed_at != null;
```

Read it as: *"skip the draft if the current round already has an editor pass that nobody has reviewed yet."* It exists so a resumed run doesn't pay for a duplicate draft.

> [!WARNING]
> **This is the source of the most confusing log sequence in the app.** If an earlier run left drafts without reviews (e.g. every reviewer call failed), the next batch starts each chapter at the **Reviewer** step and silently reuses a draft that may be hours old and produced by a different model. Nothing in the activity log says the editor step was skipped. See Known Issues.

## Related

<a href="#" data-goto="quirks:known-issues">→ Known Issues</a>
