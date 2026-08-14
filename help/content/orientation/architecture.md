# Architecture Map: How a Round Flows

Translate is a **local-only** FastAPI server plus a React SPA it serves from `client/dist/`. Its job: walk a translated book through repeated AI editor + reviewer passes and write polished chapters back out as `.docx`.

There is no cloud component. Every model call goes either to an **AI CLI already signed in on this machine** (over the Agent Client Protocol) or to **OpenRouter** over HTTPS.

## Contents

- [The request path](#the-request-path)
- [Two ways to reach a model](#two-ways-to-reach-a-model)
- [Process and lifetime](#process-and-lifetime)
- [Events and streaming](#events-and-streaming)

## The request path

A single editor pass, end to end:

1. **Client** — `ChapterRoute` or `BatchRunModal` calls `runEditorRound(slug, n, model, signal, applySuggestions)` in `client/src/api/chapters.ts`.
2. **Route** — `POST /books/{slug}/chapter/{n}/round/editor` in `server/routes/chapters.py`. It calls `_make_client(req.model)` **before publishing any event**, so a bad model fails fast with HTTP 400 and no misleading "sent" line in the activity log.
3. **Client selection** — `_make_client` decides CLI-vs-OpenRouter (see Model Routing) and returns either an `AcpProviderClient` or an `OpenRouterClient`. Both expose the same `chat()` seam.
4. **Round pass** — `server/rounds.py` `run_editor_pass()` renders the payload (`server/payload.py`), calls `client.chat(...)`, saves the raw reply immediately, parses target lines, and writes `round-N-editor{suffix}.{docx,json,raw.txt}`.
5. **Persist** — the route updates `meta.json` for the chapter and publishes `status`/`round_complete` events.

The reviewer pass is the same shape via `run_reviewer_pass()`, except its output is JSON suggestions (`round-N-reviewer.json`) rather than a document.

> [!NOTE]
> `run_editor_pass` writes `round-N-editor.raw.txt` **before** parsing. A malformed model reply therefore always leaves the raw text on disk for diagnosis, and the `RecoverableError` message names that file.

## Two ways to reach a model

| Path | Module | Transport | Cost |
|------|--------|-----------|------|
| Provider CLI | `server/acp_providers.py` | ACP: JSON-RPC 2.0 over stdio to a spawned agent | covered by your subscription |
| OpenRouter | `server/openrouter.py` | HTTPS `chat/completions` | billed per token |

Both are constructed per request, but the ACP path keeps a **process-global connection pool** (`AcpConnectionManager`) so agents are spawned once and reused across chapters. See Connection Manager.

## Process and lifetime

- Entry point is `server.main:cli` (Click), exposed as the `translate` console script.
- `create_app()` builds the FastAPI app, mounts routers, then mounts `client/dist` at `/` **after** the API routes so `/models` et al. win over static files.
- A lock file (`~/.translate/.lock`) holds the URL of a running instance; a second launch hands off to it instead of starting a rival server.
- On shutdown the lifespan hook calls `shutdown_manager()`, which terminates every spawned agent and removes the temp cwd.

> [!WARNING]
> The port is **not** fixed. `_free_port()` scans upward from 5180, so a stale process or a slow socket release puts the next launch on 5181. Always read the actual URL from the launcher output rather than assuming 5180 — see Environment Traps.

## Events and streaming

The server keeps one process-global `EventBus` (`server/sse.py`). Routes publish dicts; `GET /events` streams them as SSE. Event types: `status` (with `phase`: `sent`, `retry`, `notice`, `returned`), `token`, `round_complete`, `error`, `stop`.

Token events are **coalesced** server-side (`_TokenCoalescer`, ~300 chars per event) because a 5000-token round would otherwise publish thousands of events and force a client re-render per token. Subscriber queues are bounded at 1000 events and drop the oldest on overflow, so one slow SSE consumer cannot grow memory without limit.

## Related

<a href="#" data-goto="concepts:routing">→ Model Routing</a>

<a href="#" data-goto="providers:connection-manager">→ Connection Manager</a>

<a href="#" data-goto="quirks:environment">→ Environment Traps</a>
