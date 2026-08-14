# Repo Layout: Where Everything Lives

## Contents

- [Server](#server)
- [Client](#client)
- [Tests](#tests)
- [Packaging and docs](#packaging-and-docs)
- [Runtime data (not in the repo)](#runtime-data-not-in-the-repo)

## Server

`server/` — FastAPI app, no package sub-structure beyond `routes/`.

| File | Responsibility |
|------|----------------|
| `main.py` | `create_app()`, the `EVENT_BUS`, Click CLI, port scan, lock handling |
| `acp_providers.py` | Everything ACP: detection, catalog, connection pool, error classification. The biggest and most quirk-dense module |
| `openrouter.py` | HTTPS client with retry/backoff; same `chat()` seam as the ACP client |
| `rounds.py` | `run_editor_pass` / `run_reviewer_pass` — prompt rendering, parsing, file writes |
| `payload.py` | Builds the numbered bilingual payload and parses `[N]` / `XX:` target lines back out |
| `docx_io.py` | `ParsedDoc` model, `.docx` read/write with italic/bold runs preserved |
| `ingest.py`, `chapter_split.py` | Book ingestion, chapter detection by heading style / fallback regexes |
| `state.py` | Pydantic models for `BookMeta`, `ChapterMeta`, `RoundEntry`; load/save helpers |
| `finalize.py` | Copies the winning round output to `final.docx`, flips status to done |
| `sse.py` | `EventBus`: bounded per-subscriber queues, drop-oldest |
| `config.py`, `paths.py` | `~/.translate/config.json` (mode 600) and path helpers |
| `errors.py` | `TransientError` / `RecoverableError` / `ConfigurationError` |
| `routes/` | `books.py`, `chapters.py`, `settings.py`, `prompts.py`, `events.py`, `system.py` |

## Client

`client/src/` — React 18 + TypeScript + Vite + Tailwind.

| Path | Responsibility |
|------|----------------|
| `api/` | Thin fetch wrappers; `client.ts` holds `request()` and `ApiError` |
| `hooks/useFetch.ts` | Shared fetch-on-mount + refetch-on-focus; `useModels`/`useProviders` wrap it |
| `hooks/useEvents.ts` | Single `EventSource`, latest-handler ref pattern |
| `components/ModelPicker.tsx` | Provider selector + ModelRouter-style dropdown table |
| `lib/modelTable.ts` | Row normalization, EQ-Bench join, tier filters, sort orders, formats |
| `lib/batchRunner.ts` | Chapter/round loop, stop semantics, progress events |
| `views/` | `BookListRoute`, `BookViewRoute`, `ChapterRoute`, `SettingsRoute`, `BatchRunModal`, `NewBookModal` |
| `data/eqbench_scores.json` | 102 EQ-Bench creative-writing Elo scores, joined by OpenRouter slug |

## Tests

- `tests/server/` — pytest, one module per server module. `conftest.py` provides `translate_root` (isolated `~/.translate`) and `fixtures_dir`.
- `tests/server/test_e2e_smoke.py` — real-provider smoke tests, **skipped unless** `TRANSLATE_E2E_MODEL` or `OPENROUTER_API_KEY` is set.
- Client tests are colocated: `Foo.test.tsx` beside `Foo.tsx`, run by vitest + Testing Library.

## Packaging and docs

- `scripts/package.sh` → `release/Translate.zip`. See Packaging.
- `release-files/` — launchers (`Launch Translate.command`, `.bat`, `launch-translate.sh`) and `QUICK_START.txt`.
- `README.md` / `README_v2.md` — end-user manual (v2 is current; the zip ships v2 as `README.md`).
- `USING_YOUR_SUBSCRIPTIONS_INSTEAD_OF_OPENROUTER*.md` — the subscription-routing guide, v3 current.
- `docs/reviews/`, `docs/specs/`, `docs/superpowers/plans/` — review reports, repair specs, and implementation plans.
- `help/` — this help system.

## Runtime data (not in the repo)

Everything the user creates lives under `~/.translate/`:

```
~/.translate/
  config.json                  mode 600; openrouter_api_key, default_models, ingestion
  .lock                        {pid, url} of the running instance
  <book-slug>/
    meta.json                  BookMeta: sources, language_pair, chapters[], hidden
    source-en/chNN.{docx,json}
    source-translated/chNN.{docx,json}
    chapters/chNN/
      meta.json                ChapterMeta: status, current_round, rounds[]
      round-N-editor.{docx,json,raw.txt}
      round-N-reviewer.json
      round-N-editor-revised.{docx,json,raw.txt}
      final.docx
      archive-N/               previous edits, moved here by Restore original
```

See On-Disk State for what each field means.

## Related

<a href="#" data-goto="shipping:packaging">→ Packaging</a>

<a href="#" data-goto="concepts:state">→ On-Disk State</a>
