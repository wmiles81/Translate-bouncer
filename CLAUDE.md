# Translate — project instructions

A local FastAPI + React app that walks a translated book through repeated AI
editor/reviewer rounds. Model calls go to a locally signed-in AI CLI (over ACP)
or to OpenRouter.

## Read the developer help first

`help/` is a browsable developer help system covering architecture, round
semantics, on-disk state, provider quirks, the HTTP API, packaging, and a
current list of known issues. **Consult it before changing behaviour** — most of
the non-obvious code in this repo exists because of a quirk documented there.

```bash
python3 help/serve_help.py        # from the repo root, then open the printed URL
open help/index.html              # or just open it directly
```

Read the markdown directly if you prefer: `help/content/<category>/<page>.md`.
Start with `orientation/architecture.md`, then `quirks/known-issues.md`.

After changing behaviour, update the matching topic and run
`python3 help/build_help.py`. See `help/content/agents/maintaining-help.md`.

## Non-negotiables

- **Never remove user-facing capability** (a provider, an option, an
  integration) unless explicitly told to. Fix, don't delete.
- **Never hardcode a guessed model list.** Discover models from the provider
  (OpenRouter `/models`, `~/.codex/models_cache.json`) or expose an honest
  `<provider>/default`. Every entry in the picker must be selectable end to end.
- **Versioned files:** documentation revisions are side-by-side
  (`README_v2.md`, `..._v3.md`; lower number = older). Never edit an existing
  versioned doc in place; never version a file containing credentials.
- **Annotation sidecars:** before editing any manuscript file, read its
  `<filename>.annotations.json` and treat it as authoritative.
- **Reports go in `docs/`** (`docs/reviews/`, `docs/specs/`,
  `docs/superpowers/plans/`), not only in terminal output.

## Verify before claiming

```bash
.venv/bin/python -m pytest tests/server -q     # 150 passed, 2 skipped (e2e gated)
cd client && npm test && npm run build         # 98 passed
```

Then exercise the real app — several bugs here passed the suites and failed
live. `.venv/bin/translate` has a stale shebang; launch with
`.venv/bin/python -c "from server.main import cli; cli()" --no-browser`.
The port is the first free one from 5180, so read it from the launcher output.
