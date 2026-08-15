# House Rules an Agent Must Follow

These come from the author's global `CLAUDE.md` and from corrections issued during development. Violating them has already caused real rework on this repo.

## Contents

- [Never overwrite: versioned files](#never-overwrite-versioned-files)
- [Annotation sidecars](#annotation-sidecars)
- [Never remove a feature uninstructed](#never-remove-a-feature-uninstructed)
- [Never guess a model catalog](#never-guess-a-model-catalog)
- [Reports go in docs/](#reports-go-in-docs)
- [Verification before claims](#verification-before-claims)

## Never overwrite: versioned files

Files are not overwritten — the previous version is preserved. Two forms:

**Side-by-side (default).** The original is v1 (unsuffixed); a revision is `name_v2.ext`; both exist. Used here for `README.md` → `README_v2.md` and `USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER.md` → `_v2` → `_v3`.

**Shift-rename (call-chain exception).** When a fixed call chain owns the filename, move the current file into its `_v#` slot and write the new content at the unsuffixed name. Used here for `release-files/QUICK_START.txt` (the packager reads that exact name), whose previous copy is `QUICK_START_v1.txt`. **Lower `_v#` is older**; the unsuffixed name is always current.

**Exclusion: never version a file containing credentials.** Overwrite `~/.translate/config.json`, `.env`, and friends in place — retaining copies of a live key is a leak, and the correct recovery for a superseded credential is rotation.

Source code under version control is edited in place; git history is the record. `archive-N/` directories created by Restore follow the same lower-is-older rule.

> [!NOTE]
> This convention is why `scripts/package.sh` copies `README_v2.md` to `README.md` **inside the zip**: the repo keeps both revisions, the distribution ships the current one under the expected name.

## Annotation sidecars

The author annotates drafts in her editor; the notes land in `<filename>.annotations.json` beside the file. **Before reading, critiquing, editing, or dispatching an agent against any file, glob for its sidecar and read it.** Sweep the tree at the start of an editing pass:

```bash
find . -name "*.annotations.json"
```

Comments are terse and authoritative: an exact rewrite is applied verbatim; a named defect ("tic") is assumed **book-wide**, not local; "I have no idea what is going on here" means rewrite for clarity, not trim. Never delete, move, or clean up a sidecar; never treat an unaddressed note as resolved. (None currently exist in this repo — absence means nothing has been annotated yet, not approval.)

## Never remove a feature uninstructed

A code review flagged the OpenRouter client as dead code and the repair spec deleted it. That was wrong: *"you were never instructed to remove openrouter, put it back as a choice since some people want the choice, and IT ALWAYS WORKS."*

Removing user-facing capability — providers, integrations, options — is the user's explicit call. Fix, don't delete; if a plan proposes deletion, surface it as a decision.

## Never guess a model catalog

Hardcoded model lists are stale on arrival. Discover them: OpenRouter's `/models`, the codex CLI's `~/.codex/models_cache.json`. Where discovery is impossible, expose an honest `<provider>/default` entry rather than inventing names that silently fall back. Every entry in the picker should be selectable end to end.

## Reports go in docs/

Review and analysis output belongs in a file — `docs/reviews/`, `docs/specs/`, `docs/superpowers/plans/` — not only in terminal scrollback, which scrolls away mid-read. Summarize in chat, link the file.

## Verification before claims

Nothing is "done" on the strength of a diff. Run the suites, launch the app, hit the endpoint, read the screenshot. Several bugs here (the Codex routing regression, the stale-tab confusion) were caught only because a live check followed a green test run — and one silent `python str.replace` no-op was caught only because a test failed loudly afterwards.
