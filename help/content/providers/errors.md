# Error Taxonomy: What Retries and What Doesn't

Three exception classes in `server/errors.py` drive both retry behaviour and HTTP status. Getting a failure into the right class is the difference between a 2-second actionable message and 30 seconds of pointless retries.

## Contents

- [The three classes](#the-three-classes)
- [Classification pipeline](#classification-pipeline)
- [Why stderr capture exists](#why-stderr-capture-exists)
- [Retry loop](#retry-loop)
- [Adding a rule](#adding-a-rule)

## The three classes

| Class | HTTP | Retried? | Means |
|-------|------|----------|-------|
| `TransientError` | 502 | yes, 3 attempts at 1 s / 2 s / 4 s | network blip, 5xx, rate limit — it may clear on its own |
| `RecoverableError` | 422 | no | the model replied but the output was unusable (parse failure) |
| `ConfigurationError` | 400 | no | the user must act: sign in, install, pick another model |

## Classification pipeline

Three functions, applied in order:

**1. `_classify(exc)`** — the base mapping.

- `FileNotFoundError` → `ConfigurationError` naming the missing executable (detected by **exception type**, not by message text).
- `RequestError` with code `-32000` → `ConfigurationError` (the auth_required convention).
- Message contains an auth-ish hint (`auth`, `login`, `sign in`, `credential`, `unauthorized`, `usage limit`, `upgrade to`, `out of credits`) → `ConfigurationError`.
- Everything else → `TransientError`.

> [!NOTE]
> **"rate limit" and "quota" are deliberately NOT config errors** — they clear on their own, so they stay retryable. And `"not found"` / `"enoent"` were removed from the hint list because they misfire on transient agent errors like "session not found"; missing executables are caught by type instead.

**2. `_classify_turn(exc, detail, provider, model_arg)`** — folds in the adapter's stderr.

If the combined text says `requires a newer version` / `upgrade to the latest`, the picked model can never run on this adapter, so it becomes a `ConfigurationError` naming the model and the remedy — one attempt, not three. Otherwise the base class is kept and the stderr detail is appended to the message.

**3. `_with_provider_context(provider, exc)`** — makes it legible.

Prefixes the provider's display name and, **only for auth-shaped errors**, appends its sign-in hint from `_SIGNIN_HINT`. A missing binary or an unsupported model already carries its own remedy, so no "run `codex login`" is bolted onto them.

Result:

```
Gemini CLI (Gemini AI Pro): Authentication required — run `gemini` once and pick
a sign-in method (or set GEMINI_API_KEY), then try again.
```

## Why stderr capture exists

ACP adapters routinely return a bare `Internal error` over the wire while logging the real cause to stderr. Each `_Conn` therefore keeps a bounded tail:

- `_drain_stderr(stream, buf)` — a background task per connection, `deque(maxlen=20)`, ANSI escapes stripped via `_ANSI_RE`.
- `_adapter_detail(tail)` — pulls the innermost `error.message` out of a structured log line using `json.JSONDecoder().raw_decode()`, because adapters print trailing text after the JSON (`... }} Some(Other)`).

This is what turns "Internal error" into "The 'gpt-5.6-sol' model requires a newer version of Codex."

## Retry loop

In `AcpProviderClient.chat()`:

```python
for attempt, delay in enumerate(retry_delays, start=1):
    if attempt > 1 and on_retry: on_retry(attempt, total)
    try: return await self._manager.run_turn(...)
    except ConfigurationError: raise          # user must act
    except TransientError:                    # sleep and retry
```

`on_retry` also **resets the token coalescer** so a failed attempt's buffered tail can't prefix the retry's output.

## Adding a rule

Prefer, in order: exception **type** > structured field (e.g. JSON-RPC code) > substring. Substrings are last because they misfire across providers — that is exactly how "not found" once made every transient session error permanent. Add a case to `test_classify_policy` in `tests/server/test_acp_providers.py` when you touch this.
