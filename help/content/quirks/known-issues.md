# Known Issues and Live Gotchas

Current as of **2026-08-14**, branch `acp-repair`. These are open — the code behaves as described, deliberately or not. Fix or re-verify before trusting anything here.

## Contents

- [Stale drafts are silently reused](#stale-drafts-are-silently-reused)
- [Every stage logs twice](#every-stage-logs-twice)
- [The apply pass looks like a draft pass](#the-apply-pass-looks-like-a-draft-pass)
- [Codex 5.6 models are offered but cannot run](#codex-56-models-are-offered-but-cannot-run)
- [Gemini is detected but signed out](#gemini-is-detected-but-signed-out)
- [Deep links 404 on reload](#deep-links-404-on-reload)
- [Smaller notes](#smaller-notes)

## Stale drafts are silently reused

**Symptom:** a "full book" batch starts a chapter at the **Reviewer** step, and the log looks like it began mid-round.

**Cause:** `needsLeadingEditor()` skips the draft when the current round has an editor pass with no reviewer — intended as resume-don't-redo. But an earlier run that produced drafts and then failed every review (which is exactly what a broken reviewer model does) leaves 13 chapters in that state.

**Observed:** on 2026-08-14 a batch reviewed drafts written **3.4 hours earlier** for chapters 1–5 and 7–14; only chapter 6, which had no leftover draft, got a fresh edit. Nothing in the log said so, and the drafts may have been produced by a different editor model than the one selected for the run.

**If you fix it:** either log the reuse explicitly ("reusing round 1 draft from 10:38") or re-draft when the leftover predates the run / came from a different model. The rule lives in `client/src/lib/batchRunner.ts:12-16`.

## Every stage logs twice

`server/routes/chapters.py` publishes a `status`/`returned` event **and** a `round_complete` event back to back, so the activity log shows two lines at the same second saying the same thing:

```
14:01:33 Ch 4 R1 ← Reviewer returned 48 suggestions
14:01:33 ✓ Ch 4 R1 reviewer complete
```

Harmless, but it doubles log volume and makes sequences look repetitive.

## The apply pass looks like a draft pass

The in-round revise pass publishes the same `stage: "editor"` text as a fresh draft (`→ Editor …`, `✓ R1 editor complete`). Within one round you therefore see two identical-looking Editor entries with no way to tell draft from revision. Distinguishing them (e.g. `→ Editor (applying 48 suggestions)`) is a small change in `_round_callbacks` and the two route bodies.

## Codex 5.6 models are offered but cannot run

`codex/gpt-5.6-sol`, `-terra`, `-luna` appear in the picker (they're in the CLI's own cache) but fail: *"requires a newer version of Codex"*. The blocker is the **adapter's embedded core**, not your CLI.

Filtering them out upfront isn't possible honestly: `~/.codex/models_cache.json` strips the `minimal_client_version` field that would say which models the core supports. So the app reports the real reason instead of guessing. Use `codex/gpt-5.5`. Details in Per-Provider Quirks.

## Gemini is detected but signed out

Green dot, zero working rounds, until someone runs `gemini` once and picks an auth method. The app surfaces this correctly (400 in ~2 s, naming the remedy), but detection can't preempt it.

## Deep links 404 on reload

Loading `http://localhost:5180/book/<slug>/chapter/1` directly returns **404** — `StaticFiles(html=True)` doesn't rewrite unknown paths to `index.html`, so client-side routes only work once the SPA has loaded. Navigate from the book list instead. A catch-all route returning `index.html` for non-API paths would fix it.

## Smaller notes

- **`AcpProviderClient.chat`'s final `raise`** is only reachable when `retry_delays` is empty; it raises a `TransientError` explaining exactly that.
- **`aclose()` doesn't hold the per-provider locks**, so a connection spawned concurrently with shutdown could escape teardown. Shutdown-only, low probability, flagged during review.
- **Book and chapter status are stored twice** (book `ChapterEntry.status` and `ChapterMeta.status`) and kept in sync by hand in `finalize.py`. New transitions must update both.
- **Reviewer suggestions are advisory.** The editor prompt says "incorporate the ones you agree with", so a suggestion count in the log is not a count of applied changes.

## Related

<a href="#" data-goto="providers:quirks">→ Per-Provider Quirks</a>
