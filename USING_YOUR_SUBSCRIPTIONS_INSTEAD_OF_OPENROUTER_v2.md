# Translate — Using Your AI Subscriptions Instead of OpenRouter (v2)

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

---

## If you hit a snag

| Problem | Likely fix |
|---|---|
| Settings shows a provider as "not found" | Install its CLI (Step 3) and run it once to sign in (Step 4); click **Refresh model list**. |
| "No AI CLI detected" when you click Continue | None of the four CLIs are on your PATH. Install/sign in to at least one, then restart Translate. |
| A round fails with a sign-in / usage-limit message | You're signed out or hit your plan's cap. Run the CLI by name to re-auth, or wait for the cap to reset. |
| "Command not found" right after installing | Close the terminal and open a fresh one — PATH changes only apply to new windows. |
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
- Each turn: `new_session(cwd=<throwaway temp dir>)` → optional `set_session_model(...)` → `prompt([text_block(payload)])` under a 600s timeout. The system + user prompts are folded into one payload (`f"{system}\n\n---\n\n{user}"`) because ACP prompts carry user content only.
- **`_StreamingClient`** denies every permission request (`RequestPermissionResponse(outcome=DeniedOutcome(...))`) and advertises no filesystem/terminal capabilities, so these *coding* agents can only emit text. Streamed `AgentMessageChunk` updates are accumulated into the final reply and forwarded to `on_token`.

## Launch commands per agent

| Provider id | Executable + args |
|---|---|
| `gemini` | `gemini --experimental-acp` |
| `qwen` | `qwen --acp` |
| `claude-code` | `npx -y @agentclientprotocol/claude-agent-acp` |
| `codex` | `npx -y @zed-industries/codex-acp` |

## Model IDs

One scheme everywhere: **`provider/model`** (e.g. `claude-code/opus`, `gemini/gemini-2.5-pro`, `codex/default`, `qwen/default`). The frontend derives the provider badge by splitting on `/`. `set_session_model` maps the `model` half to whatever the agent actually exposes (matched against the session's `available_models`); `default` leaves the agent's current model.

## Endpoints

- `GET /models` returns a **static catalog** in OpenRouter's object shape with `$0` pricing — no API key, no network call.
- `GET /providers` returns `[{id, name, detected}]` (detected via `shutil.which` on the base CLI) for the Settings status list.

## Error handling

Reuses the existing taxonomy (`server/errors.py`): auth / usage-limit / missing-executable text → `ConfigurationError` (block, route to Settings, no retry); timeouts / crashes / transient failures → `TransientError` (retried with the same backoff as before).

## Tests

`tests/server/test_acp_providers.py` mocks at the connection-manager boundary: streamed chunks accumulate and fire `on_token`; transient errors retry then succeed; configuration errors don't retry; the error classifier maps auth/usage/ENOENT correctly; permission requests are denied. Run `pytest tests/server` for the full suite.

## Notes / known sharp edges

- `npx`-based adapters (Claude, Codex) have a slow first launch while the package downloads; pre-install to avoid it.
- Per-agent model names aren't fixed across versions — `set_session_model` is best-effort and silently falls back to the agent's current model if no match is found.
- `client/dist` must be rebuilt (`cd client && npm run build`) after frontend changes; the server serves the prebuilt bundle.
