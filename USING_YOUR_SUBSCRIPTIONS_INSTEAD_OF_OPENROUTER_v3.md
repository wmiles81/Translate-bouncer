# Translate — Using Your AI Subscriptions Instead of OpenRouter (v3)

> **What changed in v3.** A repair pass tightened the edges of the v2 ACP conversion: the leftover `openrouter_api_key` config field is gone entirely (stale keys in an old `~/.translate/config.json` are ignored on load and dropped the next time you save Settings); a provider now shows "detected" only when every binary its launch needs is actually reachable; a bad or unavailable model choice fails fast with a clear message instead of quietly doing something else; and there's a real per-turn timeout with automatic retry. See **[For the technical person / maintainer](#for-the-technical-person--maintainer)** for the details.

> **What changed in v2.** The original guide described *how to convert* Translate from OpenRouter to subscription CLIs by spawning each CLI in headless `-p` mode. This build actually ships that conversion — and it uses a cleaner mechanism: the **Agent Client Protocol (ACP)**, which also streams the model's output live into the activity log. This document describes the shipped behavior, how to set it up, and (at the end) how it works under the hood. It also adds a caveat the original omitted — see **[Read this first](#read-this-first-terms-of-service)**.

---

## What this is, in plain English

**Translate** polishes AI-translated manuscripts chapter by chapter, running each through repeated **Editor → Reviewer → Editor** rounds. Out of the box the upstream app sends every round through **OpenRouter**, which bills per word — a full novel typically runs **$30–$50**.

This build instead talks to the **AI command-line tools** you've already signed into with your existing subscription (**Claude Max, ChatGPT Plus, Gemini AI Pro**, or a free Qwen account). Each round is covered by the subscription you already pay for, so a whole book costs **$0 extra**.

---

## Read this first: Terms of Service

Driving a consumer subscription (Claude Max / ChatGPT Plus / Gemini AI Pro) through its CLI as an **automated, headless backend** for batch work is *not* the interactive, personal use those plans are sold for. All three providers' consumer terms lean against repurposing subscription access this way.

**The realistic downside is not a surprise bill — it's account suspension.** Use your own subscriptions, on your own books, at a human pace, and understand that you're accepting that risk. If you can't afford to have an account paused, stay on OpenRouter (it's metered but sanctioned). This is your call to make with eyes open.

---

## What you gain vs. what you lose

**You gain:** every round is included in your subscription; a novel costs $0 extra; you can **watch the model's output stream live** in the activity log as each chapter is edited.

**You lose:** the giant 400+ model menu shrinks to the handful your subscriptions route to — Claude Opus / Sonnet / Haiku, Gemini 2.5 Pro / Flash / Flash-Lite, plus Codex (ChatGPT) and Qwen. For fiction translation those are the ones you'd pick anyway.

---

## What you need

- At least **one** of: Claude Max, ChatGPT Plus, Gemini AI Pro (or a free Qwen account).
- A working copy of Translate.
- About **15 minutes**, one time.
- Comfort pasting one or two lines into a terminal.

You only need one subscription. With more than one you get useful contrast — e.g. Claude as Editor, Gemini as Reviewer.

---

## Setup — walk through this once

### Step 1: Install Node.js
1. Go to **https://nodejs.org**
2. Click the green **LTS** button, run the installer, click through to the end.
3. Restart if it asks.

### Step 2: Open a terminal
- **Windows:** Start → type `powershell` → Enter.
- **Mac:** `Cmd + Space` → type `terminal` → Enter.

### Step 3: Install the AI tools **and the two ACP adapters**
Paste this one line, press Enter, wait 1–2 minutes:

```
npm install -g @anthropic-ai/claude-code @openai/codex @google/gemini-cli @qwen-code/qwen-code
```

Gemini and Qwen speak ACP directly. **Claude and Codex need a small adapter package** — these are fetched automatically the first time Translate uses them (via `npx`), so there's nothing extra to install for those two. (If you'd rather pre-install them so the first run is instant: `npm install -g @agentclientprotocol/claude-agent-acp @zed-industries/codex-acp`.)

### Step 4: Sign each tool into your account
For each provider you have, run its base CLI once, sign in through the browser tab that opens, then type `/quit`:

| If you have… | Run this once |
|---|---|
| Claude Max | `claude` |
| ChatGPT Plus | `codex` |
| Gemini AI Pro | `gemini` |
| (free) Qwen | `qwen` |

Sign-in is once per tool — it stays signed in on this computer.

### Step 5: Open Translate and pick your models
Start Translate, open **⚙ Settings**. The old "OpenRouter API key" box is gone; in its place is an **AI providers** list showing which tools were detected (●) or not (○). Set:
- **Default Editor model** → e.g. `claude-code/opus`
- **Default Reviewer model** → e.g. `gemini/gemini-2.5-pro` (a second opinion)

Save, add a book, and run rounds. The activity log shows the model's text streaming in as it works. Your wallet doesn't move.

---

## Things to know up front

- **Model prices show as "free."** That's correct — your subscription covers it.
- **You can watch it think.** A live preview pane under the activity log shows the model's output streaming token-by-token during each round.
- **Codex (ChatGPT Plus) has a daily cap.** Big overnight batches can hit it; Codex calls then fail until the cap resets (a few hours). Claude Max and Gemini AI Pro are more generous, so this only bites if Codex is your only subscription.
- **Mix and match.** Editor = Claude Opus, Reviewer = Gemini 2.5 Pro is a strong pairing. Whatever you set in Settings is the default; override per-chapter from the chapter page.
- **No tools, no file access.** Translate tells each agent it may only return text — it cannot read or write files on your machine during a round.
- **If a chosen model isn't available, you're told, not switched silently.** Pick a model your provider doesn't currently expose and the round still runs — on that provider's own default model — but a **notice** line appears in the activity log saying so, instead of quietly substituting something else with no record of it.
- **A round that goes unusually quiet still resolves.** Each turn gets up to 10 minutes; if an agent hangs, Translate cancels it, restarts the connection, and retries automatically rather than leaving a round stuck forever.

---

## If you hit a snag

| Problem | Likely fix |
|---|---|
| Settings shows a provider as "not found" | Install its CLI (Step 3) and run it once to sign in (Step 4); click **Refresh model list**. Note that Claude and Codex need **two** things on the PATH to count as detected — `claude`/`codex` *and* `npx` — since Translate launches them through the `npx`-fetched ACP adapter. |
| "No AI CLI detected" when you click Continue | None of the four CLIs are on your PATH. Install/sign in to at least one, then restart Translate. |
| A round fails with a sign-in / usage-limit message | You're signed out or hit your plan's cap. Run the CLI by name to re-auth, or wait for the cap to reset. |
| "Command not found" right after installing | Close the terminal and open a fresh one — PATH changes only apply to new windows. Translate's server also checks the common install locations (`/usr/local/bin`, `/opt/homebrew/bin`, `~/.npm-global/bin`, `~/.local/bin`) even if a Finder-launched copy's own PATH is minimal, so this is mainly about your terminal's own PATH, not Translate's. |
| Requesting a model shows a red error naming a provider | The provider in that model id isn't installed/signed in (or the id is stale — e.g. left over from before the OpenRouter switch, like `anthropic/claude-sonnet-4`). The round doesn't start. Pick a model from a detected provider in Settings. |
| First Claude/Codex round is slow to start | `npx` is fetching the ACP adapter once; subsequent runs are fast. Pre-install them (Step 3) to avoid the wait. |

---
---

# For the technical person / maintainer

Everything above is for the author. This section documents how the subscription wiring is actually built in this repo, so it can be maintained.

## Architecture

The OpenRouter seam was a single method, `OpenRouterClient.chat(...)`. It's replaced by `server/acp_providers.py`, which exposes the **same** seam plus a streaming hook:

```python
async def chat(*, model, system, user,
               retry_delays=DEFAULT_RETRY_DELAYS, on_retry=None, on_token=None) -> str
```

`server/rounds.py` is unchanged except the import and the new `on_token` pass-through; the two route handlers in `server/routes/chapters.py` supply an `on_token` lambda that publishes a `{"type": "token", ...}` SSE event so the frontend can stream it.

## The ACP client (`server/acp_providers.py`)

- Uses the official **`agent-client-protocol`** Python SDK (`pip install agent-client-protocol`, added to `pyproject.toml`).
- **`AcpConnectionManager`** keeps **one persistent connection per provider** (claude-code, codex, gemini, qwen), spawned lazily via `spawn_agent_process(...)`, serialized by a per-connection `asyncio.Lock`, restarted if the child process dies, and torn down on app shutdown (FastAPI lifespan → `shutdown_manager()`).
- Each turn: `new_session(cwd=<throwaway temp dir>)` → optional `set_session_model(...)` → `prompt([text_block(payload)])` under a `PROMPT_TIMEOUT` of 600s. Spawning/initializing the agent connection in the first place (`spawn_agent_process` + handshake) has its own `SPAWN_TIMEOUT` of 120s, generous because `npx` may need to download the Claude/Codex adapter package on first use. The system + user prompts are folded into one payload (`f"{system}\n\n---\n\n{user}"`) because ACP prompts carry user content only.
- **Timeout/retry behavior.** A `SPAWN_TIMEOUT` or `PROMPT_TIMEOUT` expiry is raised as a `TransientError`; the in-flight session is cancelled (`connection.cancel(session_id=...)`, best-effort) and the retry that follows spawns a fresh agent connection instead of reusing the one that hung. Rate-limit/quota text is likewise classified `TransientError` and retried, on the theory it clears on its own; auth/sign-in problems are classified `ConfigurationError` and are never retried, since retrying can't fix those.
- **`_StreamingClient`** denies every permission request (`RequestPermissionResponse(outcome=DeniedOutcome(...))`) and advertises no filesystem/terminal capabilities, so these *coding* agents can only emit text. Streamed `AgentMessageChunk` updates are accumulated into the final reply and forwarded to `on_token`.

## Launch commands per agent

| Provider id | Executable + args |
|---|---|
| `gemini` | `gemini --experimental-acp` |
| `qwen` | `qwen --acp` |
| `claude-code` | `npx -y @agentclientprotocol/claude-agent-acp` |
| `codex` | `npx -y @zed-industries/codex-acp` |

## Model IDs

One scheme everywhere: **`provider/model`** (e.g. `claude-code/opus`, `gemini/gemini-2.5-pro`, `codex/default`, `qwen/default`). The frontend derives the provider badge by splitting on `/`. `set_session_model` maps the `model` half to whatever the agent actually exposes (matched against the session's `available_models`); `default` leaves the agent's current model. If the requested model half doesn't match anything the agent exposes, `set_session_model` falls back to the agent's current model **and this is no longer silent**: `run_turn`'s `on_notice` callback fires, `server/routes/chapters.py` publishes it as a `{"type": "status", "phase": "notice", ...}` SSE event, and the activity log shows it inline (e.g. "Ch 3 R1 Editor — requested model not available, using agent default"). The round still completes on the agent's default rather than failing.

## Provider detection (`detect_providers` / `require_provider`)

- `detect_providers()` in `server/acp_providers.py` reports a provider as `"detected": true` only when **every** binary its launch needs is resolvable on `shutil.which(..., path=...)` against the augmented PATH (see `_subprocess_env` below) — not just the base CLI. `_REQUIRED_BINARIES` is `{"claude-code": ("claude", "npx"), "codex": ("codex", "npx"), "gemini": ("gemini",), "qwen": ("qwen",)}`; Claude and Codex need both entries because they launch via `npx <adapter>`, which drives the base CLI underneath.
- `_subprocess_env()` prepends `/usr/local/bin`, `/opt/homebrew/bin`, `~/.npm-global/bin`, and `~/.local/bin` (each only if the directory exists) ahead of the process's inherited `PATH` before spawning an agent **or** running detection, so a Finder-launched server (whose PATH is typically just the OS default) still finds CLIs installed the normal way.
- `require_provider(model)` — called from `server/routes/chapters.py`'s `_make_client` before a round is allowed to start — parses the `provider/model` id, and raises `ConfigurationError` (surfaced as HTTP 400) upfront if the provider name is unrecognized *or* recognized but not detected. The unrecognized-provider message explicitly calls out the stale-saved-default case (e.g. a pre-switch id like `anthropic/claude-sonnet-4` left over from an old config), so the author isn't left guessing why a previously-saved default suddenly errors. No `sent` activity-log event is published for a round that fails this check — it never reaches the agent.

## Endpoints

- `GET /models` returns a **static catalog** in OpenRouter's object shape with `$0` pricing — no API key, no network call.
- `GET /providers` returns `[{id, name, detected}]` (detected per the rules above) for the Settings status list.

## Config

`server/config.py`'s `Config` model has no `openrouter_api_key` field (and `server/openrouter.py` is deleted along with it). Pydantic's default `model_validate_json` ignores unrecognized keys, so a pre-existing `~/.translate/config.json` with a stale `openrouter_api_key` from before this repair loads without error; the key is simply absent from the parsed `Config` object. It disappears from disk the next time `save_config` runs, since `model_dump_json` only serializes known fields — no migration step is needed.

## Error handling

Reuses the existing taxonomy (`server/errors.py`): auth / usage-limit / missing-executable text → `ConfigurationError` (block, route to Settings, no retry); timeouts / crashes / transient failures → `TransientError` (retried with the same backoff as before, `DEFAULT_RETRY_DELAYS = (1.0, 2.0, 4.0)`). See **Provider detection** above for the upfront-400 path and **Timeout/retry behavior** above for what happens when a turn itself times out mid-flight.

## Tests

- `tests/server/test_acp_providers.py` mocks at the connection-manager boundary: streamed chunks accumulate and fire `on_token`; transient errors retry then succeed; configuration errors don't retry; the error classifier maps auth/usage/ENOENT correctly; permission requests are denied.
- `tests/server/test_config.py` / `test_routes_settings.py` cover the stale `openrouter_api_key` being dropped on load and absent from the settings API response.
- Run `.venv/bin/python -m pytest tests/server -q` for the full suite (the smoke test below is skipped by default).
- **`tests/server/test_e2e_smoke.py`** is a real-agent smoke test, skipped unless `TRANSLATE_E2E_MODEL` is set. It replaces the old `OPENROUTER_API_KEY=...` smoke-test invocation. Run it manually before a release, with that provider's CLI installed and signed in:

  ```
  TRANSLATE_E2E_MODEL=claude-code/sonnet pytest tests/server/test_e2e_smoke.py -v -s
  ```

  It ingests a small fixture book and runs one real Editor pass and one real Reviewer pass against the live agent — useful for catching drift in an agent's ACP adapter or model-name scheme that the mocked suite can't see.

## Notes / known sharp edges

- `npx`-based adapters (Claude, Codex) have a slow first launch while the package downloads; pre-install to avoid it.
- Per-agent model names aren't fixed across versions — `set_session_model` is best-effort and falls back to the agent's current model if no match is found, but that fallback now surfaces to the author as an activity-log notice (see **Model IDs** above) rather than happening invisibly.
- `client/dist` must be rebuilt (`cd client && npm run build`) after frontend changes; the server serves the prebuilt bundle.
