# Endpoint Reference

Every route is local-only (`127.0.0.1`) and unauthenticated. Routers live in `server/routes/`.

## Contents

- [Books](#books)
- [Chapters and rounds](#chapters-and-rounds)
- [Settings, models, providers](#settings-models-providers)
- [Prompts](#prompts)
- [Events and system](#events-and-system)
- [Error shapes](#error-shapes)

## Books

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/books` | Slugs of **visible** books (hidden ones filtered out) |
| `POST` | `/books` | Ingest. Body: `translated_path`, `english_path`, `language_pair{from,to}`. Paths are quote/whitespace-stripped by `_clean_path` |
| `GET` | `/books/{slug}` | Full `BookMeta`. Works even when hidden |
| `DELETE` | `/books/{slug}` | Hide from the list. **Deletes nothing**; returns `files_kept_at` |
| `POST` | `/books/{slug}/restore` | Every chapter back to round 0; edits moved to `chapters/chNN/archive-N/`. Returns `files_archived` |

Ingestion raises `ChapterCountMismatch` (HTTP 400) when the two source documents split into different chapter counts — the most common ingest failure.

## Chapters and rounds

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/books/{slug}/chapter/{n}/state` | `ChapterMeta` |
| `POST` | `/books/{slug}/chapter/{n}/round/editor` | Body: `{model, apply_suggestions?}`. `apply_suggestions: true` writes `round-N-editor-revised.*` and does **not** advance the round |
| `POST` | `/books/{slug}/chapter/{n}/round/reviewer` | Body: `{model}`. Returns `ReviewerResult` with `suggestions[]` |
| `POST` | `/books/{slug}/chapter/{n}/finalize` | Copies the round's winning doc to `final.docx`, status → `done` |
| `GET` | `/books/{slug}/chapter/{n}/docs` | `{english, working, previous, suggestions}` for the panes |
| `GET` | `/books/{slug}/chapter/{n}/dialog` | Per-round raw editor/reviewer exchanges |

Both round routes validate the model **before** publishing any event, so a bad model can never produce a "sent" line it doesn't follow through on.

## Settings, models, providers

| Method | Path | Notes |
|--------|------|-------|
| `GET` / `PUT` | `/settings` | Whole-config read/write (`Config` model). PUT replaces; the client always sends the full object |
| `GET` | `/models` | CLI catalog (`source: "cli"`) **plus** the live OpenRouter list when a key is set. A failed OpenRouter fetch is swallowed so CLI entries still work |
| `GET` | `/providers` | `[{id, name, detected}]` — binary presence only, not sign-in state |

## Prompts

Mounted under `/prompts` (`server/routes/prompts.py`): `GET /{kind}`, `PUT /{kind}`, `DELETE /{kind}/{version_id}`, `POST /{kind}/restore/{version_id}`, where `kind` is `editor` or `reviewer`. Prompts are versioned — editing creates a new version and the chapter records which version ran in `prompts_used`.

## Events and system

- `GET /events` — SSE stream of `status`, `token`, `round_complete`, `error`, `stop`. The generator returns when it sees a `stop` event.
- `POST /system/pick-path` — native file/folder picker used by the New Book modal.
- `GET /health` — `{"status": "ok"}`.

## Error shapes

Two different `detail` shapes, which client code must handle:

```jsonc
// ConfigurationError → 400: a plain string
{ "detail": "Gemini CLI (Gemini AI Pro): Authentication required — run `gemini` ..." }

// Transient (502) / Recoverable (422): an object
{ "detail": { "message": "...", "kind": "transient" } }
```

`client/src/api/client.ts` throws `ApiError(status, detail)` for any non-2xx, and callers surface `errorMessage(err)`.
