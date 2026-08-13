# Translate — Using Your AI Subscriptions Instead of OpenRouter (v3)

> **What changed in v3.** A repair pass tightened the edges of the v2 ACP conversion — and, on author instruction, brought **OpenRouter back as a first-class, optional routing choice** alongside the subscription CLIs (v2 had removed it entirely; that removal is reverted). The two now coexist, split by an **exact** model-id match, not a prefix: a model id that is **exactly** `claude-code/default`, `codex/default`, `gemini/default`, or `qwen/default` (or a bare provider name with no slash) routes through that provider's CLI over ACP, exactly as described in this guide. **Every other model id** — including one that merely *starts with* a CLI's name, like a hand-typed `claude-code/opus`, and including OpenRouter ids that happen to share a CLI's name, like `qwen/qwen3-max` — routes through OpenRouter and requires an OpenRouter API key, which lives in Settings again. (The exact-match rule exists because OpenRouter genuinely serves models under a `qwen/...` namespace; prefix matching would have silently hijacked those to your local Qwen CLI instead of billing OpenRouter.) A provider now shows "detected" only when every binary its launch needs is actually reachable; a bad or unavailable model choice fails fast with a clear message instead of quietly doing something else; and there's a real per-turn timeout with automatic retry. The model catalog is also no longer a hardcoded list of named CLI models — see **[Things to know up front](#things-to-know-up-front)** and **[For the technical person / maintainer](#for-the-technical-person--maintainer)** for the details.

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

**You gain:** every round run on a subscription CLI is included in your subscription; a novel run entirely that way costs $0 extra; you can **watch the model's output stream live** in the activity log as each chapter is edited.

**You lose, if you go CLI-only:** each subscription CLI gives Translate exactly one honest, unnamed model choice — "whatever that CLI's own default model is" (`claude-code/default`, `gemini/default`, etc.) — not a menu of named models like Opus vs. Sonnet. That's not a UI limitation; the Claude Code and Codex ACP adapters don't expose a model list to talk to at all, so a named model could never actually be selected through them. If you want the full named-model menu back — Claude Opus vs. Sonnet, GPT-5, Gemini 2.5 Pro vs. Flash, and hundreds more — set an OpenRouter API key in Settings (see [Read this first](#read-this-first-terms-of-service) for the cost tradeoff) and Translate adds OpenRouter's entire live catalog, with real pricing, on top of the CLI choices. Nothing stops you from mixing: subscription CLI as Editor, a specific OpenRouter-billed model as Reviewer, or any other combination.

---

## What you need

- At least **one** of: Claude Max, ChatGPT Plus, Gemini AI Pro (or a free Qwen account) — **and/or** an OpenRouter API key.
- A working copy of Translate.
- About **15 minutes**, one time.
- Comfort pasting one or two lines into a terminal.

You only need one of the above. With more than one you get useful contrast — e.g. Claude as Editor, Gemini as Reviewer — and if you set up both a subscription CLI and an OpenRouter key, you get the widest choice: subscription CLIs for $0-extra rounds, OpenRouter for anything else in its catalog.

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
Start Translate, open **⚙ Settings**. An **AI providers** list shows which CLI tools were detected (●) or not (○). Below it, the **OpenRouter** section still has the familiar API key box — leave it blank if you're going subscription-only, or paste your key if you also want OpenRouter's model catalog. Set:
- **Default Editor model** → e.g. `claude-code/default` (runs on whatever model that CLI is currently configured to use), or an OpenRouter model id like `anthropic/claude-opus-4` if you've set a key
- **Default Reviewer model** → e.g. `gemini/default` (a second opinion from a different provider)

Save, add a book, and run rounds. The activity log shows the model's text streaming in as it works. A CLI round costs your wallet nothing; an OpenRouter round bills your OpenRouter account as usual.

---

## Things to know up front

- **Subscription CLI models show as "free"; OpenRouter models show real pricing.** A `claude-code/default`, `codex/default`, `gemini/default`, or `qwen/default` round is covered by your subscription — $0. Any other model id (once you've set an OpenRouter key) bills your OpenRouter account at that model's listed rate, same as the original app.
- **The CLI model list is one entry per provider, not a named-model menu.** Because the Claude Code and Codex ACP adapters don't expose a list of models to pick from, Translate offers exactly one honest choice per detected CLI: "\<Provider\> — CLI default model." If you want to pick Opus vs. Sonnet, or Gemini Pro vs. Flash, by name, that comes from OpenRouter's catalog once you've set a key in Settings — not from the CLI entries.
- **CLI rounds stream in small batches; OpenRouter rounds arrive all at once.** A live preview pane under the activity log shows the model's output during each round. For a subscription-CLI round it arrives in visible ~300-character jumps rather than a smooth per-token trickle — that's deliberate coalescing to keep the UI responsive, not lag. For an OpenRouter round there's no token-by-token stream from the API at all, so the pane stays empty and then fills with the entire reply at once when it arrives — that's expected, not a stall. Either way, the pane only ever shows the chapter you're currently viewing; if you switch to another chapter or a batch run is working on one you're not looking at, that chapter's output isn't shown there (the activity log below it still logs every chapter).
- **Codex (ChatGPT Plus) has a daily cap.** Big overnight batches can hit it; Codex calls then fail until the cap resets (a few hours). Claude Max and Gemini AI Pro are more generous, so this only bites if Codex is your only subscription. (OpenRouter rounds aren't subject to this — they're billed, not capped.)
- **Mix and match.** Editor = a subscription CLI, Reviewer = a specific OpenRouter model is a strong pairing if you want a genuinely different "opinion" from a named model. Whatever you set in Settings is the default; override per-chapter from the chapter page.
- **No tools, no file access.** Translate tells each CLI agent it may only return text — it cannot read or write files on your machine during a round. (This restriction is specific to the ACP/CLI path; OpenRouter calls are plain chat completions and never had file access to begin with.)
- **Hand-typing a named CLI-looking model (e.g. `claude-code/opus`) does not run on that CLI.** The catalog only ever offers `<provider>/default`, and that's not a UI limit — routing itself now requires an **exact** match to `<cli>/default` (or a bare provider name). Anything else, including a model id that merely starts with a CLI's name, routes through OpenRouter instead: `claude-code/opus` is looked up as an OpenRouter model (and fails there with "Model not available" unless OpenRouter genuinely serves an id by that name), and it needs an OpenRouter key regardless. There's no supported way to hand-pick a named model on a subscription CLI today.
- **No OpenRouter key, but you picked a non-CLI model?** The round fails immediately with an HTTP 400 explaining that the model routes through OpenRouter and needs a key — nothing is sent, nothing is billed.
- **A round that goes unusually quiet still resolves.** Each turn gets up to 10 minutes; if an agent hangs, Translate cancels it, restarts the connection, and retries automatically rather than leaving a round stuck forever. (OpenRouter rounds retry on the same schedule for 5xx/429 responses.)

---

## If you hit a snag

| Problem | Likely fix |
|---|---|
| Settings shows a provider as "not found" | Install its CLI (Step 3) and run it once to sign in (Step 4); click **Refresh model list**. Note that Claude and Codex need **two** things on the PATH to count as detected — `claude`/`codex` *and* `npx` — since Translate launches them through the `npx`-fetched ACP adapter. |
| "No AI CLI detected" when you click Continue | None of the four CLIs are on your PATH, and no OpenRouter key is set. Install/sign in to at least one CLI, or set an OpenRouter key in Settings, then restart Translate. |
| A round fails with a sign-in / usage-limit message | You're signed out of that CLI or hit your plan's cap. Run the CLI by name to re-auth, or wait for the cap to reset. |
| "Command not found" right after installing | Close the terminal and open a fresh one — PATH changes only apply to new windows. Translate's server also checks the common install locations (`/usr/local/bin`, `/opt/homebrew/bin`, `~/.npm-global/bin`, `~/.local/bin`) even if a Finder-launched copy's own PATH is minimal, so this is mainly about your terminal's own PATH, not Translate's. |
| Requesting a model shows a red error naming a provider | If the model id is **exactly** `claude-code/default`, `codex/default`, `gemini/default`, or `qwen/default`, that CLI isn't installed/signed in — install it or pick a detected provider. Anything else — a genuine OpenRouter model id, an old id like `anthropic/claude-sonnet-4` left over from before the CLI switch, or even a named model that merely *starts with* a CLI's name (`claude-code/opus`, `qwen/qwen3-max`) — routes through OpenRouter and needs an API key in Settings, since only the exact `<cli>/default` id reaches the local CLI. Set a key, or pick a `<provider>/default` model instead. |
| First Claude/Codex round is slow to start | `npx` is fetching the ACP adapter once; subsequent runs are fast. Pre-install them (Step 3) to avoid the wait. |

---
---

# For the technical person / maintainer

Everything above is for the author. This section documents how the subscription wiring is actually built in this repo, so it can be maintained.

## Architecture

OpenRouter's original seam was a single method, `OpenRouterClient.chat(...)` in `server/openrouter.py`. That file is back (a v2/v3-era removal of it was reverted): `server/acp_providers.py` (the ACP client) and `server/openrouter.py` now both implement the **same** `chat(...)` seam, and `server/routes/chapters.py::_make_client(model)` picks which one to instantiate per round. The split is an **exact** match on the model id, not a provider-name prefix match:

```python
def _make_client(model: str):
    """Route by model id: exactly "<cli>/default" -> that provider CLI over ACP;
    anything else -> OpenRouter.

    The catalog only ever advertises "<cli>/default" for CLI providers (the adapters
    can't switch models), and OpenRouter's org namespace collides with bare CLI names
    (e.g. OpenRouter serves qwen/qwen3-max) — so the CLI match must be exact.
    """
    provider, model_arg = split_model(model)
    if provider in PROVIDER_LAUNCH and model_arg in ("", "default"):
        require_provider(model)
        return AcpProviderClient()
    cfg = load_config()
    if not cfg.openrouter_api_key:
        raise ConfigurationError(...)         # -> HTTP 400, no key configured
    return OpenRouterClient(api_key=cfg.openrouter_api_key)
```

Note the `model_arg in ("", "default")` guard: a model id like `claude-code/opus` has `provider == "claude-code"` but `model_arg == "opus"`, so it falls through to the OpenRouter branch exactly like a completely unrelated id (`z-ai/glm-4.7`) would. Only `claude-code/default`, `claude-code` (bare, `model_arg == ""`), or the equivalent for codex/gemini/qwen take the ACP branch.

Both clients expose:

```python
async def chat(*, model, system, user,
               retry_delays=DEFAULT_RETRY_DELAYS, on_retry=None, on_token=None, on_notice=None) -> str
```

`OpenRouterClient.chat` is non-streaming under the hood (a single POST to `/chat/completions`) but still calls `on_token` exactly once, with the whole reply, so it plugs into the same coalescer/SSE pipeline as the ACP client without the route handlers needing to know which backend they're talking to.

`server/rounds.py` is unchanged except the import and the new `on_token` pass-through; the two route handlers in `server/routes/chapters.py` supply an `on_token` callback that isn't a raw publish-per-chunk lambda but a **`_TokenCoalescer`** — it buffers streamed chunks and publishes one `{"type": "token", ...}` SSE event per ~300 characters (`threshold=300`), flushing the remainder when the pass returns (success or failure) so the tail is never lost. Without it, a multi-thousand-token round would otherwise publish thousands of SSE events and force a client re-render per token; the frontend only ever sees the batched output, not the raw per-chunk stream. On the client, `ChapterRoute.tsx`'s `useEvents` handler further scopes `token` events to the chapter currently being viewed (`chapter === n`) — a token event for any other chapter is dropped, so the preview pane never mixes output from two chapters and stays empty while a batch works on a chapter you aren't viewing.

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

## Model IDs and the catalog (`model_catalog()`)

One scheme everywhere: **`provider/model`**. The frontend derives the provider badge by splitting on `/`. There are two disjoint families of model id, and `_make_client` (above) — an **exact-id** check, not a prefix check — is the only place that distinguishes them:

- **CLI-routed:** exactly `claude-code/default`, `codex/default`, `gemini/default`, or `qwen/default` (or the bare provider name, no slash). `server/acp_providers.py::model_catalog()` returns **exactly one entry per detected CLI** in this shape: `{id: "<provider>/default", name: "<Provider> — CLI default model", pricing: $0/$0}`. There are no named per-provider entries (no `claude-code/opus`, no `gemini/gemini-2.5-pro`) — the code comment in `acp_providers.py` documents why: *"the claude-code and codex adapters expose `session.models = None` over ACP (verified live), so a named model here could never actually be selected — the CLI always runs its own configured default."* Since `_make_client` only ever hands the ACP client a `model_arg` of `""` or `"default"`, `AcpConnectionManager._resolve_model` (which tries to map a non-default model half against whatever `session.models` the agent reports) is effectively dead code on the normal request path today — it's retained as a safety net inside the ACP client rather than exercised in practice. If it ever did fire on an unmatched model, `run_turn`'s `on_notice` callback would publish a `{"type": "status", "phase": "notice", ...}` SSE event and the activity log would show it inline (e.g. "Ch 3 R1 Editor — requested model not available, using agent default") — but don't present this as a supported way to pick a named CLI model; a hand-typed `claude-code/opus` never reaches the ACP client at all, because `_make_client` routes it to OpenRouter first (see **Architecture** above).
- **OpenRouter-routed:** every other model id, **including one that shares a CLI's provider name but isn't exactly `<cli>/default`** — e.g. `claude-code/opus`, or a genuine OpenRouter model like `qwen/qwen3-max`. `GET /models` (below) appends OpenRouter's live catalog — real ids, real pricing — when a key is configured. A CLI round always runs on that CLI's own configured default model; there is no way to select a named model through a subscription CLI today, and typing what looks like one just sends it to OpenRouter instead.

## Provider detection (`detect_providers` / `require_provider`)

- `detect_providers()` in `server/acp_providers.py` reports a provider as `"detected": true` only when **every** binary its launch needs is resolvable on `shutil.which(..., path=...)` against the augmented PATH (see `_subprocess_env` below) — not just the base CLI. `_REQUIRED_BINARIES` is `{"claude-code": ("claude", "npx"), "codex": ("codex", "npx"), "gemini": ("gemini",), "qwen": ("qwen",)}`; Claude and Codex need both entries because they launch via `npx <adapter>`, which drives the base CLI underneath.
- `_subprocess_env()` prepends `/usr/local/bin`, `/opt/homebrew/bin`, `~/.npm-global/bin`, and `~/.local/bin` (each only if the directory exists) ahead of the process's inherited `PATH` before spawning an agent **or** running detection, so a Finder-launched server (whose PATH is typically just the OS default) still finds CLIs installed the normal way.
- `require_provider(model)` — called from `_make_client` only when the model id is an **exact** `<cli>/default` match (`provider in PROVIDER_LAUNCH and model_arg in ("", "default")`), before a round is allowed to start — parses the `provider/model` id and raises `ConfigurationError` (surfaced as HTTP 400) if that provider is recognized but not detected. `require_provider`'s own internal "unknown provider" branch is effectively unreachable from `_make_client` today, since `_make_client` already filtered to `provider in PROVIDER_LAUNCH` before calling it; it stays in the function as a defensive check for any other caller. Everything that *doesn't* clear the exact-match gate — a model id with a CLI's name but a non-`default` model half (`claude-code/opus`), a genuine OpenRouter id, or a stale pre-CLI-switch id like `anthropic/claude-sonnet-4` — skips `require_provider` entirely and falls into the OpenRouter branch of `_make_client`, which raises its own `ConfigurationError` (also HTTP 400) if no `openrouter_api_key` is configured. No `sent` activity-log event is published for a round that fails either check — it never reaches the agent or OpenRouter.

## Endpoints

- `GET /models` returns `model_catalog()` (the `<provider>/default` entries for detected CLIs, `$0` pricing) **plus**, when `cfg.openrouter_api_key` is set, the live result of `OpenRouterClient.list_models()` appended to the same list — real ids, real `context_length`, real `pricing`. This is a real network call to `openrouter.ai` when a key is present; if that call raises, the exception is swallowed (`except Exception: pass`) and the response falls back to just the CLI entries, so a flaky OpenRouter fetch never breaks the CLI-only path.
- `GET /providers` returns `[{id, name, detected}]` (detected per the rules above) for the Settings status list. This endpoint is unaffected by OpenRouter and never changes based on the key.

## Config

`server/config.py`'s `Config` model has the `openrouter_api_key: str = ""` field back (a prior repair pass on this branch had removed it; that removal was reverted). It's optional — an empty string means "no OpenRouter routing," and any model id that isn't an exact `<cli>/default` match will fail at `_make_client` with a 400 until a key is set. `GET/PUT /settings` round-trips the field like any other config value; `client/src/views/SettingsRoute.tsx` renders it as a password-type input under an "OpenRouter" heading, with copy explaining that setting it makes non-CLI-default model ids routable and adds OpenRouter's catalog to `GET /models`.

## Error handling

Reuses the existing taxonomy (`server/errors.py`): auth / usage-limit / missing-executable text → `ConfigurationError` (block, route to Settings, no retry); timeouts / crashes / transient failures → `TransientError` (retried with the same backoff as before, `DEFAULT_RETRY_DELAYS = (1.0, 2.0, 4.0)`). `OpenRouterClient.chat` maps HTTP 401/403 → `ConfigurationError` ("OpenRouter rejected the API key"), HTTP 404 → `ConfigurationError` ("Model not available"), and 5xx/429/network errors → `TransientError`, retried on the same backoff schedule as the ACP path. See **Provider detection** above for the upfront-400 path and **Timeout/retry behavior** above for what happens when an ACP turn itself times out mid-flight.

## Tests

- `tests/server/test_acp_providers.py` mocks at the connection-manager boundary: streamed chunks accumulate and fire `on_token`; transient errors retry then succeed; configuration errors don't retry; the error classifier maps auth/usage/ENOENT correctly; permission requests are denied.
- `tests/server/test_config.py` / `test_routes_settings.py` cover `openrouter_api_key` round-tripping through load/save and the settings API.
- `tests/server/test_routes_chapters.py` covers `_make_client`'s routing split (exact `<cli>/default` match vs. everything else, including a CLI-prefixed-but-non-default id) and the no-key-configured 400.
- Run `.venv/bin/python -m pytest tests/server -q` for the full suite (the two smoke tests below are skipped by default).
- **`tests/server/test_e2e_smoke.py`** holds two real-backend smoke tests, each independently gated by its own env var, so you can exercise either or both:

  ```
  TRANSLATE_E2E_MODEL=claude-code/default pytest tests/server/test_e2e_smoke.py -v -s   # ACP / subscription CLI
  OPENROUTER_API_KEY=sk-or-...            pytest tests/server/test_e2e_smoke.py -v -s   # OpenRouter
  ```

  Each ingests a small fixture book and runs one real Editor pass (the OpenRouter one also asserts on `edited.paragraphs`; the ACP one additionally runs a real Reviewer pass) against the live backend — useful for catching drift in an agent's ACP adapter, a model-name scheme, or OpenRouter's API shape that the mocked suite can't see. Neither runs in CI; both are opt-in, manual, pre-release checks.

## Notes / known sharp edges

- `npx`-based adapters (Claude, Codex) have a slow first launch while the package downloads; pre-install to avoid it.
- `set_session_model` and its `on_notice` fallback (see **Model IDs and the catalog** above) exist as a defensive safety net inside the ACP client, but `_make_client`'s exact-match gate means a named, non-`default` model never reaches the ACP client on the normal request path in the first place — it's routed to OpenRouter before `AcpConnectionManager` ever sees it. Don't describe hand-typing a named CLI model as a supported flow.
- A saved default from the earlier no-OpenRouter era of this branch (or from before the original OpenRouter-only app was converted) still works exactly as it did before, once an OpenRouter key is set — `_make_client` doesn't distinguish "id predates a config change" from "id was always meant for OpenRouter"; it just checks whether the id is an exact `<cli>/default` match, and routes everything else to OpenRouter regardless of why the id looks the way it does.
- `client/dist` must be rebuilt (`cd client && npm run build`) after frontend changes; the server serves the prebuilt bundle.
