# Model Routing: CLI Catalog vs OpenRouter

Every model id looks like `provider/model`. Which transport it takes is decided by **membership in the live CLI catalog**, not by the id's shape.

## Contents

- [The rule](#the-rule)
- [Why membership and not a prefix](#why-membership-and-not-a-prefix)
- [What the catalog contains](#what-the-catalog-contains)
- [Preflight validation](#preflight-validation)
- [Adding a provider](#adding-a-provider)

## The rule

`_make_client(model)` in `server/routes/chapters.py`:

```python
if model in cli_model_ids() or (provider in PROVIDER_LAUNCH and model_arg in ("", "default")):
    require_provider(model)
    return AcpProviderClient()
# else: OpenRouter, and a 400 if no API key is configured
```

`cli_model_ids()` is `{m["id"] for m in model_catalog()}` — recomputed per call, so it reflects which CLIs are installed *right now*.

## Why membership and not a prefix

Because the namespaces collide. OpenRouter serves models under an org called `qwen` (`qwen/qwen3-max`), and `qwen` is also one of our CLI provider ids. A prefix rule would route an OpenRouter model to a local CLI.

An earlier fix over-corrected to "only the exact string `<cli>/default` is a CLI model", which then broke Codex's real per-model ids (`codex/gpt-5.5` silently went to OpenRouter and returned an HTTP 400 from `openrouter.ai`). Catalog membership handles both cases correctly. There is a regression test for exactly this: `test_make_client_routes_codex_model_ids_to_the_cli`.

## What the catalog contains

`model_catalog()` in `server/acp_providers.py` returns OpenRouter-shaped objects so the frontend renders them unchanged. Entries carry `source: "cli"`, which is how the client separates routes in the picker.

- **One `<provider>/default` per detected CLI.** Claude Code, Gemini and Qwen expose **no models over ACP** (`session.models` is `None`, verified live), so a named model could never be selected for them — offering one would be a lie.
- **Every model the codex CLI knows**, read from `~/.codex/models_cache.json` (entries with `visibility: "list"`), offered as `codex/<slug>`. Never a hardcoded list.
- **Plus the live OpenRouter list**, merged by `GET /models` when an API key is configured. A failed OpenRouter fetch is swallowed so the CLI entries still work.

CLI entries are priced `$0/$0`; the UI renders that as free because the subscription covers it.

> [!NOTE]
> **Never hardcode a guessed model list.** Model names churn constantly and a guessed catalog is stale on arrival. Discover from the CLI (as with the codex cache) or from the provider API, and where discovery is impossible expose an honest `default` entry.

## Preflight validation

`require_provider(model)` raises `ConfigurationError` (→ HTTP 400) when:

- the provider isn't in `PROVIDER_LAUNCH` — the message lists valid providers and notes the id may be a stale saved default;
- the provider's CLI isn't detected — the message names the CLI to install.

Routes call this **before publishing any event**, so a bad model never produces a "sent" line followed by a mid-flight failure.

## Adding a provider

1. Add to `PROVIDER_LAUNCH` (`id -> (executable, [args])`) and `_PROVIDER_NAMES`.
2. Add its launch-time binaries to `_REQUIRED_BINARIES` — **every** binary the launch needs, not just the base CLI. Claude and Codex need `npx` too because they launch through an npm adapter.
3. Add a sign-in hint to `_SIGNIN_HINT` so auth failures tell the user what to run.
4. If the CLI can switch models, extend `model_catalog()` to discover them; if it can only be pinned at launch, follow the codex pattern in `_launch_plan()`.
