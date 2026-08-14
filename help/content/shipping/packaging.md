# Building and Testing Translate.zip

End users get a zip; they need Python 3.11+ but **not** Node, git, or a build step.

## Contents

- [Build it](#build-it)
- [What goes in](#what-goes-in)
- [Test it like a user](#test-it-like-a-user)
- [Release checklist](#release-checklist)

## Build it

```bash
./scripts/package.sh          # from the repo root
# → release/Translate.zip  (~134K)
```

The script reads the version from `pyproject.toml`, builds the client, stages a tree, and zips it.

> [!NOTE]
> Staging happens in a local `mktemp -d`, **not** on the repo volume, because the SMB share races directory removal — see Environment Traps. The zip still lands in `release/`.

## What goes in

| In the zip | Source |
|------------|--------|
| `server/` | repo, minus `__pycache__`/`*.pyc` |
| `client/dist/` | freshly built — the user never runs Vite |
| `pyproject.toml` | so first launch can `pip install -e .` |
| `README.md` | **`README_v2.md`** renamed — the zip ships the current revision under the plain name |
| `QUICK_START.txt`, `LICENSE.txt` | `release-files/` |
| `Launch Translate.command` / `.bat` / `launch-translate.sh` | `release-files/`, unix ones `chmod +x` |

Tests, `.git`, `node_modules`, and `client/src` are excluded.

First launch creates `.venv` inside the unzipped folder and `pip install -e .` (~30 s), then execs `./.venv/bin/translate`.

## Test it like a user

Never ship a zip you haven't launched:

```bash
SP=/tmp/translate-disttest
rm -rf "$SP" && mkdir -p "$SP" && unzip -q release/Translate.zip -d "$SP"
cd "$SP/Translate" && ./"Launch Translate.command"
```

Then smoke it against the port it actually chose:

```bash
curl -s localhost:PORT/health
curl -s localhost:PORT/providers | python3 -m json.tool
curl -s localhost:PORT/models | python3 -c "import json,sys; print(len(json.load(sys.stdin)), 'models')"
```

Re-running `unzip -o` over an existing test install refreshes the code but **keeps the `.venv`**, which makes iteration fast. Kill the old instance and clear the lock first (`pkill -f "bin/translate"; rm -f ~/.translate/.lock`), or the launcher hands off to the dead one.

> [!WARNING]
> The test install shares your real `~/.translate/`, so it sees your actual books and can edit them. That's useful for realistic testing and dangerous for destructive experiments.

## Release checklist

1. Both suites green and the client builds — see Dev Loop.
2. Run the e2e smoke tests against at least one real provider.
3. Bump `version` in `pyproject.toml`.
4. Update `QUICK_START.txt` if setup changed, and `README_v2.md` (or the next `README_v#.md`) if behaviour changed — **never edit an existing versioned doc in place**, see House Rules.
5. `./scripts/package.sh`, then launch the zip from a clean directory and click through: Settings → providers detected, model picker populated, one chapter round, Done → `final.docx`.
6. Refresh this help system if features moved (Keeping This Help Current).

## Related

<a href="#" data-goto="quirks:environment">→ Environment Traps</a>

<a href="#" data-goto="orientation:dev-loop">→ Dev Loop</a>

<a href="#" data-goto="agents:conventions">→ House Rules</a>

<a href="#" data-goto="agents:maintaining-help">→ Keeping This Help Current</a>
