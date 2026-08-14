# Per-Provider Quirks (Claude, Codex, Gemini, Qwen)

Four providers, four different failure personalities. All were verified live on 2026-08-14.

## Contents

- [Detection is not readiness](#detection-is-not-readiness)
- [Claude Code](#claude-code)
- [Codex](#codex)
- [Gemini CLI](#gemini-cli)
- [Qwen Code](#qwen-code)

## Detection is not readiness

`detect_providers()` only answers *"are the binaries on the PATH the server will actually use?"* — it resolves each entry of `_REQUIRED_BINARIES` against `_subprocess_env()["PATH"]`, the same augmented PATH `_spawn` passes to the child.

That augmentation matters: launched from Finder, the server's PATH is `/usr/bin:/bin:...` while the CLIs live in `/opt/homebrew/bin` or `~/.npm-global/bin`. Detection probing the raw ambient PATH reported "not found" for everything while spawning would have succeeded.

> [!WARNING]
> A green "detected" dot does **not** mean the provider works. It cannot see sign-in state, subscription limits, or adapter/core version skew. Gemini is detected on this machine and cannot run a single round.

## Claude Code

- Launch: `npx -y @agentclientprotocol/claude-agent-acp`; requires both `claude` and `npx`.
- Exposes **no models over ACP** (`session.models` is `None`), so the catalog offers only `claude-code/default`. It runs whatever the CLI is configured for (`~/.claude/settings.json`, e.g. `"model": "opus[1m]"`).
- **Verified working** as both editor (~15 s on a short chapter) and reviewer.
- This is the adapter whose available-commands session update blows past asyncio's 64 KiB line limit — see `STREAM_LIMIT` in Connection Manager.

## Codex

- Launch: `npx -y @zed-industries/codex-acp`; requires both `codex` and `npx`.
- The adapter is a **self-contained Rust binary** (platform packages like `codex-acp-darwin-arm64`) with a Codex core compiled in. It does **not** shell out to your `codex` CLI for the model call — it only shares `~/.codex/` for auth and config.
- Cannot switch models in-session, but accepts `-c model="<slug>"` at launch. Hence per-model pooled connections keyed `codex::<slug>`.
- Models are discovered from `~/.codex/models_cache.json` (`visibility: "list"`).

> [!WARNING]
> **The 5.6 family fails.** `codex/gpt-5.6-sol`, `-terra` and `-luna` return `The 'gpt-5.6-sol' model requires a newer version of Codex`. The adapter's embedded core (~0.137.0 by its version strings) predates them; adapter 0.16.0 is already the latest release, and updating your `codex` CLI does **not** help — the CLI is already *ahead* of the embedded core (the core logs `unknown variant 'max'` when parsing the cache your newer CLI wrote). **Use `codex/gpt-5.5`** (verified: HTTP 200 with real suggestions). When a newer adapter ships, `npx -y` picks it up on the next spawn with no code change.

## Gemini CLI

- Launch: `gemini --experimental-acp`; requires only `gemini`.
- Rejects the SDK's default `initialize` params — the reason `_initialize()` sends `clientCapabilities` explicitly.
- **Blocked on this machine:** no auth method configured. `gemini -p "..."` reports *"Please set an Auth method in your ~/.gemini/settings.json or specify one of GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA"*. Fix by running `gemini` once and picking a sign-in method.
- The app handles this correctly: HTTP 400 in ~2 s with the provider name and remedy, no retries.

## Qwen Code

- Launch: `qwen --acp`; requires only `qwen`.
- Not installed here, so it shows "not found" and its option is disabled in the picker. Untested end to end.
- Note the namespace collision: OpenRouter serves models under a `qwen` org (`qwen/qwen3-max`) that are **not** CLI models — see Model Routing.

## Related

<a href="#" data-goto="providers:connection-manager">→ Connection Manager</a>

<a href="#" data-goto="concepts:routing">→ Model Routing</a>
