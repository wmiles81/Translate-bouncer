# Running Tests and the Dev Loop

## Contents

- [Server](#server)
- [Client](#client)
- [Running the app in development](#running-the-app-in-development)
- [End-to-end smoke tests](#end-to-end-smoke-tests)
- [What "green" means here](#what-green-means-here)

## Server

Always use the project venv's interpreter. Run from the repo root:

```bash
.venv/bin/python -m pytest tests/server -q
```

Lint:

```bash
.venv/bin/python -m ruff check server tests
```

> [!WARNING]
> `.venv/bin/translate` and other console scripts have a **stale shebang** pointing at a venv path from a previous folder name, so they fail with `bad interpreter`. Launch the app with `.venv/bin/python -c "from server.main import cli; cli()"` instead, or use the packaged launcher.

## Client

From `client/`:

```bash
npm test            # vitest run, whole suite
npx vitest run src/components/ModelPicker.test.tsx    # one file
npm run build       # tsc -b && vite build
```

> [!WARNING]
> Do **not** use `npx tsc -b --noEmit` for a quick type check — it fails with `TS6310: Referenced project tsconfig.node.json may not disable emit`, a pre-existing project-reference issue unrelated to your changes. Use `npx tsc --noEmit` (no `-b`) for ad-hoc checks, and `npm run build` as the real gate.

## Running the app in development

Two options:

**Serve the built client from FastAPI** (what the packaged app does):

```bash
cd client && npm run build && cd ..
.venv/bin/python -c "from server.main import cli; cli()" --no-browser --port 5199
```

**Or Vite dev server** with the API proxied — check `client/vite.config.ts` for the proxy target if you go this route.

The server picks the **first free port from 5180 upward** unless you pass `--port`. Pass `--no-browser` in automated contexts so it doesn't open a tab each restart.

## End-to-end smoke tests

`tests/server/test_e2e_smoke.py` holds two real-provider tests, each independently gated so a normal run skips them:

```bash
# Provider CLI path (needs that CLI installed and signed in)
TRANSLATE_E2E_MODEL=codex/gpt-5.5 .venv/bin/python -m pytest tests/server/test_e2e_smoke.py -v -s

# OpenRouter path
OPENROUTER_API_KEY=sk-or-... .venv/bin/python -m pytest tests/server/test_e2e_smoke.py -v -s
```

These run **real rounds against real models** on the sample fixtures and cost real time (and OpenRouter money). Run them before a release, not in a loop.

## What "green" means here

A change is not done until **both** suites pass and the client builds:

```bash
.venv/bin/python -m pytest tests/server -q      # currently 150 passed, 2 skipped
cd client && npm test && npm run build          # currently 98 passed
```

The two skips are the e2e smoke tests above. If your skip count is higher, something you care about is being silently skipped.
