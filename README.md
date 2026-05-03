# Translate

A local web app for AI-assisted bilingual chapter proofreading. Point it at a
translated book and its English original, pick chapters to proof, and run a
multi-round Editor → Reviewer loop using any pair of OpenRouter-routed models.

## Status

Plan 1 (server) is complete. Plan 2 (web client) is pending — for now, drive
the server via HTTP/curl.

## Install (development)

```
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Run

```
translate
```

The server picks a free port (5180+), opens your default browser, and prints
the URL. Lock file lives at `~/.translate/.lock`. A second `translate` invocation
detects the running instance, opens a browser tab to the existing URL, and
exits.

## API surface

- `GET  /health` — liveness check
- `GET  /settings`, `PUT /settings` — config (API key, default models, ingestion patterns)
- `GET  /models` — proxied OpenRouter model list
- `GET  /prompts/{kind}`, `PUT /prompts/{kind}` — prompts with version history
  - `POST /prompts/{kind}/restore/{version_id}` — restore a past version
  - `DELETE /prompts/{kind}/{version_id}` — delete a historical version
- `GET  /books`, `POST /books`, `GET /books/{slug}` — list, ingest, get state
- `GET  /books/{slug}/chapter/{n}/state` — chapter state
- `POST /books/{slug}/chapter/{n}/round/editor`   — run an Editor pass
- `POST /books/{slug}/chapter/{n}/round/reviewer` — run a Reviewer pass
- `POST /books/{slug}/chapter/{n}/finalize` — write `final.docx`, mark done
- `GET  /events` — Server-Sent Events stream of round progress

## Manual smoke procedure (real OpenRouter)

```
export OPENROUTER_API_KEY=sk-or-...
pytest tests/server/test_e2e_smoke.py -v -s
```

## Tests

```
pytest tests/server/ -v
```

## Where state lives

- `~/.translate/config.json` (mode 600) — API key + default models + ingestion patterns
- `~/.translate/prompts/{editor,reviewer}.json` — current prompt + version history
- `~/.translate/<book-slug>/` — per-book working folder
- `~/.translate/.lock` — single-instance lock (PID + URL)
