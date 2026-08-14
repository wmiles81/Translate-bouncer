# Environment Traps (SMB, ports, locks, tsc)

Failures that look like code bugs but are environmental. Each one cost real debugging time on this repo.

## Contents

- [The repo lives on an SMB share](#the-repo-lives-on-an-smb-share)
- [The port is not 5180](#the-port-is-not-5180)
- [Stale lock file](#stale-lock-file)
- [Stale console scripts in .venv](#stale-console-scripts-in-venv)
- [tsc -b --noEmit is broken here](#tsc--b---noemit-is-broken-here)
- [A stale browser tab lies to you](#a-stale-browser-tab-lies-to-you)
- [Shell cwd persists between commands](#shell-cwd-persists-between-commands)

## The repo lives on an SMB share

`/Volumes/Storage/...` is `//wmiles49@tower.local/Storage` (smbfs). macOS AppleDouble files race directory removal there, producing:

```
ENOTEMPTY, Directory not empty: client/dist/assets
rm: release/Translate: Directory not empty
```

**Symptoms:** `vite build` fails on a clean-out step; `scripts/package.sh` fails at staging.

**Mitigations already in place:** `package.sh` stages and zips in a local `mktemp -d` and retries the `release/` clean. **Still manual:** if `npm run build` hits `ENOTEMPTY`, `rm -rf client/dist` and rerun — it is not your code.

## The port is not 5180

`_free_port()` scans upward from 5180. A killed-but-not-yet-released socket or a lingering instance puts the next launch on **5181**, and the browser tab you already have open then talks to nothing (or to the old server).

Always read the real URL:

```bash
grep -ao "127.0.0.1:518[0-9]" /path/to/launcher.log | head -1
lsof -nP -iTCP -sTCP:LISTEN | grep 518
```

## Stale lock file

`~/.translate/.lock` outlives a hard-killed server. The launcher then prints *"Translate is already running at http://localhost:5180"* and exits without starting anything:

```bash
pkill -f "bin/translate"; sleep 2; rm -f ~/.translate/.lock
```

## Stale console scripts in .venv

`.venv/bin/translate` (and friends) carry a shebang pointing at a venv path from a previous folder name:

```
.venv/bin/translate: line 2: .../untitled folder/.venv/bin/python3.11: bad interpreter
```

The venv's `python` itself is fine. Launch with:

```bash
.venv/bin/python -c "from server.main import cli; cli()" --no-browser --port 5199
```

Recreating the venv would fix it properly.

## tsc -b --noEmit is broken here

```
tsconfig.json(21,18): error TS6310: Referenced project 'tsconfig.node.json' may not disable emit.
```

Pre-existing project-reference issue, reproducible on a clean tree. Use `npx tsc --noEmit` (no `-b`) for ad-hoc checks; `npm run build` (`tsc -b && vite build`, no extra flag) is the real gate.

## A stale browser tab lies to you

The SPA fetches its catalog once at mount. After a server restart adds models, an open tab still shows the old list — twice this looked like a missing feature ("no Codex models", "no Stop now button") when the server was serving them correctly.

`useFetch` now refetches on window focus, which self-heals models and providers. **A code change still needs a reload** — the JS bundle is only fetched on page load. When verifying UI work, hard-reload or check the served bundle:

```bash
ASSET=$(curl -s http://localhost:5180/ | grep -o 'assets/index-[^"]*\.js')
curl -s "http://localhost:5180/$ASSET" | grep -c "SomeNewString"
```

## Shell cwd persists between commands

An agent's shell keeps its working directory across tool calls. A `cd` into the unpacked test copy (`.../dist-test/Translate`) followed by "edit `server/acp_providers.py`" silently patches the **packaged copy**, not the repo — the tests still pass because they run against the repo, and the change vanishes at the next `unzip -o`.

Use absolute paths, or `cd /Volumes/Storage/Development/Software/General/Translate` first. Prefer tools that fail loudly on a missed match over `python str.replace`, which no-ops silently.
