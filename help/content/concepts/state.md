# On-Disk State: books, chapters, meta.json

All user data lives under `~/.translate/`. Nothing about a book is stored in the repo, and the server holds no database — the filesystem *is* the state.

## Contents

- [BookMeta](#bookmeta)
- [ChapterMeta](#chaptermeta)
- [config.json](#configjson)
- [Remove vs Restore](#remove-vs-restore)
- [The lock file](#the-lock-file)

## BookMeta

`~/.translate/<slug>/meta.json`, model in `server/state.py`:

| Field | Meaning |
|-------|---------|
| `slug` | Directory name; derived from title + language pair, deduped with `-2`, `-3` |
| `created_at` | ISO timestamp |
| `sources` | Absolute paths of the ingested English and translated documents |
| `language_pair` | `{from_, to}` — note `from_` (trailing underscore, `from` is reserved) |
| `chapters[]` | `ChapterEntry`: `n`, `title`, `status` |
| `hidden` | `true` hides the book from `GET /books`. Files stay on disk |

## ChapterMeta

`~/.translate/<slug>/chapters/chNN/meta.json`:

| Field | Meaning |
|-------|---------|
| `n` | Chapter number (1-based) |
| `status` | `untouched` / `in_progress` / `done` |
| `current_round` | Highest round opened; `0` = never edited |
| `models` | Last editor/reviewer model ids used |
| `prompts_used` | Prompt version ids for provenance |
| `rounds[]` | `RoundEntry` per round — see Rounds |

`ChapterStatus.DONE` is set only by `finalize_chapter()`, which also copies the round's winning document to `final.docx` and updates the matching `ChapterEntry` in the book meta.

> [!NOTE]
> Chapter meta and book meta both carry status. They are updated together in `finalize.py`; if you add a new state transition, update both or the book list and the chapter view will disagree.

## config.json

`~/.translate/config.json`, written with mode `600` via `os.open(..., 0o600)` because it can hold an API key:

```json
{
  "openrouter_api_key": "",
  "default_models": { "editor": "", "reviewer": "" },
  "ingestion": { "heading_style": "Heading 1", "fallback_patterns": ["^Chapter\\s+\\d+", "..."] }
}
```

Pydantic ignores unknown keys, so configs written by older builds load cleanly and simply drop fields that no longer exist on the next save.

## Remove vs Restore

Two book-level actions, both **non-destructive**:

| Action | Endpoint | Effect |
|--------|----------|--------|
| Remove | `DELETE /books/{slug}` | Sets `hidden: true`. The book vanishes from the list; every file stays. Flip the flag back in `meta.json` to restore it |
| Restore original | `POST /books/{slug}/restore` | Every chapter back to round 0 / `untouched`; `round-*` files and `final.docx` **move** into `chapters/chNN/archive-N/` |

`archive-N` numbering follows the project convention: **lower N is older**. A second restore creates `archive-2` and leaves `archive-1` untouched. Ingested sources are never modified by either action, so the "original translation" is always intact.

## The lock file

`~/.translate/.lock` holds `{pid, url}`. On launch, `read_lock()` + `_pid_alive()` decide whether to hand off to a running instance instead of starting a second server.

> [!WARNING]
> A hard-killed server leaves the lock behind. The next launcher then prints "Translate is already running at http://localhost:5180" and exits without starting anything. Delete `~/.translate/.lock` and relaunch. See Environment Traps.

## Related

<a href="#" data-goto="concepts:rounds">→ Rounds</a>

<a href="#" data-goto="quirks:environment">→ Environment Traps</a>
