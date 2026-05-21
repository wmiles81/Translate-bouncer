# Translate — But Using Your AI Subscriptions Instead of OpenRouter

## What this is, in plain English

**Translate** is a local web app that helps you polish AI-translated manuscripts chapter by chapter. The way it ships, every round of editing gets sent through a service called **OpenRouter**, which charges you per word of AI text. A full novel typically costs **$30–$50 in OpenRouter bills** to translate properly.

If you already pay for **Claude Max, ChatGPT Plus, or Gemini AI Pro** ($20–$200 a month), you're paying for AI usage *twice* — once for the subscription you already have, again per-word through OpenRouter.

This guide explains how to **rewire Translate to use the subscriptions you already pay for**, so each book costs **$0 extra above your monthly sub.**

---

## How it works (one paragraph, no jargon)

The AI companies — Anthropic, OpenAI, Google, Qwen — each ship a small free tool that talks to their AI models on your behalf, using your subscription login (no separate API key, no extra charge). Translate can be wired to use **those tools** instead of OpenRouter. The app looks and works identically — same chapters, same Editor/Reviewer rounds, same Done button — your bills just disappear.

---

## What you'll get vs. what you'll lose

**You gain:** Every translation round is included in your existing subscription. A novel costs $0 extra. Batch ten chapters overnight without watching a meter tick.

**You lose:** Translate's giant model menu (it currently shows 400+ models) shrinks to about 6–8 models — the ones your subscription tools route to. You'll have access to Claude Opus / Sonnet / Haiku, Gemini 2.5 Pro / Flash / Lite, and possibly OpenAI's and Qwen's models. No GPT-4o, no DeepSeek, no exotic models.

For fiction translation, those 6–8 are the ones you'd actually pick anyway.

---

## What you need before starting

- At least one of these subscriptions you already pay for:
  - **Claude Max** ($20–$200/mo from Anthropic)
  - **ChatGPT Plus** ($20/mo from OpenAI)
  - **Gemini AI Pro** ($20/mo from Google)
- A working copy of Translate on your computer
- About **15 minutes** of setup, **one time only**
- Comfort copy-pasting one line into a terminal window. (If you can paste into Microsoft Word, you can paste into a terminal — it's the same gesture.)

You only need **one** subscription to use Translate. If you have multiple, you'll have more flexibility (you can use Claude as Editor and Gemini as Reviewer, for example).

---

## Setup — Walk through this once

### Step 1: Install Node.js

Node.js is a free tool the AI companies' command-line apps need to run.

1. Go to **https://nodejs.org**
2. Click the big green button labeled **LTS** (left side)
3. Open the file that downloads, click Next/Next/Next through the installer, finish
4. If it asks you to restart your computer, do that

Done. You'll never touch Node directly — it just needs to be there.

### Step 2: Open a terminal

- **Windows:** Click Start menu, type `powershell`, press Enter. A blue or black window opens.
- **Mac:** Press `Cmd + Space`, type `terminal`, press Enter.

You should see a window with text and a blinking cursor. That's a terminal. You'll be pasting two lines into it.

### Step 3: Install the AI company tools

Copy this entire line. Paste it into the terminal. Press Enter.

```
npm install -g @anthropic-ai/claude-code @openai/codex @google/gemini-cli @qwen-code/qwen-code
```

You'll see a lot of text scroll by for 1–2 minutes. When it stops and shows a fresh blinking cursor, the tools are installed.

### Step 4: Sign each tool into your accounts

For each AI company you have a sub with, type the matching command into the terminal and press Enter. A browser tab will open — sign in with your subscription account (the same account you use to log into Claude.ai, ChatGPT, etc.). Approve the permissions it asks for. Then come back to the terminal, type `/quit`, and press Enter.

| If you have... | Type this into the terminal |
|---|---|
| Claude Max | `claude` |
| ChatGPT Plus | `codex` |
| Gemini AI Pro | `gemini` |
| (free) Qwen account | `qwen` |

The sign-in only happens once per tool — after that, the tool stays signed in forever on this computer.

### Step 5: Wire Translate to use the tools

This is the only part that needs a technical person (or a coding assistant like Claude Code or Cursor) to do for you. **It's a small change** — one new file added, three existing files lightly edited, about 250 lines of code total. The technical details are at the bottom of this document. Hand that section to whoever helps you, and they should be done in under an hour.

### Step 6: Open Translate and pick your models

Once the wiring is done, restart Translate. Open it in your browser. Click **⚙ Settings** in the top right. You should now see:

- **Default Editor model** — pick `Claude Code — opus` (the strongest model your Claude sub gives you)
- **Default Reviewer model** — pick a different model, like `Gemini — gemini-2.5-pro` (so a second perspective critiques the first)

Click Save. Add a book the usual way. Start running rounds. The activity log will show the models working through each chapter. Your wallet will not move.

---

## Things to know up front

- **The Settings page may still say "OpenRouter API key" with an empty input field.** That field doesn't do anything anymore — leave it blank. (It's a cosmetic leftover that depends on whether your copy of Translate includes the frontend source code. If it doesn't, the label sticks around. It doesn't affect anything you do.)
- **Pricing shown in the model picker will be $0/$0 across the board.** That's actually correct — your subscription covers it, so the marginal cost per word really is zero.
- **Codex (ChatGPT Plus) has a daily usage cap.** If you run a huge batch and hit it, Codex calls will fail until the cap resets (usually a few hours later, when your ChatGPT day rolls over). Claude Max has much higher caps and Gemini AI Pro is generous too, so this only bites if Codex is your only sub and you batch hard.
- **You can mix and match.** Editor = Claude Opus, Reviewer = Gemini 2.5 Pro is a great pairing. Or Editor = Claude Opus, Reviewer = Claude Sonnet (different models from the same provider — still useful contrast). Whatever combination you set in Settings becomes the default; you can override per-chapter from the chapter page.

---

## If you hit a snag

| Problem | Likely fix |
|---|---|
| "Command not found" when typing `gemini` etc. | Close the terminal, open a fresh one. PATH changes only apply to new windows. |
| Translate shows "not authenticated" | Run the CLI by name (`claude`, `gemini`, etc.) in a terminal to log in again. |
| Translate shows "usage limit" | You hit your ChatGPT/Claude/Gemini sub's daily cap. Wait for it to reset (a few hours). |
| Gemini says "untrusted folder" | The technical wiring is missing the `--skip-trust` flag — see the technical section below. |
| Nothing happens when you paste my instructions | Check that you pasted only the command, not the surrounding `#` comment lines. PowerShell waits forever if it sees half a command. |

---

---
---

# For the technical person doing the wiring

(Hand them this section. Everything above is for the author.)

## Architecture

Translate's connection to OpenRouter lives in exactly one file: `server/openrouter.py`. That file exports a class with one important method:

```python
async def chat(*, model: str, system: str, user: str) -> str:
    # POSTs to https://openrouter.ai/api/v1/chat/completions
    # returns the assistant's text reply
```

Everywhere else in the app, code just calls `client.chat(...)` and trusts it to return text. **That's the only seam you need to cut.**

## The swap

Add a new file, `server/cli_providers.py`, exporting a class with the same `chat()` signature, but using `asyncio.create_subprocess_exec()` instead of `httpx.AsyncClient`. Then update three import lines elsewhere.

### Files that change

| File | Change |
|---|---|
| **NEW**: `server/cli_providers.py` | The subprocess-based client + a registry of CLIs and their routable models (~250 LOC). |
| `server/rounds.py` | One import line: `from server.openrouter import OpenRouterClient` → `from server.cli_providers import CliProviderClient`. |
| `server/routes/chapters.py` | Same one-line import swap. Also delete the "no OpenRouter API key configured" guard — no key needed now. |
| `server/routes/settings.py` | `/models` returns a static catalog of CLI-routable models instead of proxying OpenRouter. Optionally add `/providers` for a CLI-detection status route. |

The React frontend (`client/dist/`) is untouched. The model picker keeps working because `/models` still returns model objects in OpenRouter's JSON shape; just $0/$0 prices and a much shorter list.

## CLI invocation cheat sheet

Each CLI has its own non-interactive incantation. These are the patterns that work for headless single-turn calls:

```
claude  -p --model {opus|sonnet|haiku} --output-format text   < prompt
codex   exec -c model_reasoning_effort="minimal" -            < prompt
gemini  -p "" -m {gemini-2.5-pro|...} -o text --skip-trust    < prompt
qwen    -p "" -o text                                          < prompt
```

Combine the system + user prompts into one piped stdin payload (the CLIs don't all have a separate system slot in headless mode):

```
{system}

---

{user}
```

## Gotchas

- **Codex with ChatGPT-account auth refuses an explicit `--model`** — it picks server-side. Don't pass `--model` to Codex or you get HTTP 400.
- **Codex defaults to reasoning effort "high"**, which burns ~20× the tokens for fluency tasks. Pass `-c model_reasoning_effort="minimal"` for translation work.
- **Gemini requires `--skip-trust`** for headless calls outside a folder the user has trusted in the interactive CLI. Without it, exit code 55 and a "not in a trusted directory" error.
- **Argv length limit on Windows (~32k chars).** Book-chapter payloads blow past this. Always pipe via stdin, never via positional argv.
- **The subprocess `env=` parameter needs Node + npm-global on PATH.** If the user launches Translate from a shell that doesn't have those on PATH, the subprocess won't find the CLI even though `which claude` works fine for the user. Prepend `C:\Program Files\nodejs` and `%APPDATA%\npm` (Windows) or the equivalent macOS/Linux paths to PATH inside the subprocess env.
- **Error classification is string-matching, not HTTP codes.** OpenRouter gave you 401/429/5xx. CLIs print arbitrary text to stderr. Substring match on `auth`, `login`, `credential`, `sign in`, `not signed in`, `provider returned error` → ConfigurationError (block, surface, don't retry). Match on `usage limit`, `quota`, `upgrade to`, `out of credits` → also ConfigurationError (same UX as auth failure — user needs to act, retry won't help). Everything else → TransientError (eligible for retry with backoff).
- **Model name strings differ per provider.** Claude: `opus` / `sonnet` / `haiku`. Codex: omit `--model` entirely. Gemini: `gemini-2.5-pro` / `gemini-2.5-flash` / `gemini-2.5-flash-lite` (verify with a probe — newer names like `gemini-3-pro` aren't yet routable through the CLI). Qwen: omit `--model`, let interactive config choose.
- **PowerShell execution policy** can block the `.ps1` shims that npm installs alongside `.cmd`. On Windows, `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force` fixes it once per user account.

## Time estimate

If you're a competent Python dev who's seen FastAPI before: **2-4 hours**, including writing the new module, running OAuth setup on each CLI, smoke-testing one chapter end-to-end, and verifying error paths.

## Test plan

1. Install Node, install all four CLIs globally, OAuth each one.
2. Confirm `CliProviderClient().chat(model="claude:opus", system="Reply with one word.", user="Translate hello to French")` returns "bonjour".
3. Same for each provider with a known-good model.
4. Boot Translate, hit `/health`, `/providers`, `/models`.
5. Run one chapter through the UI: pick Editor + Reviewer, click Continue, verify `round-1-editor.docx`, `round-1-reviewer.json`, `round-2-editor.docx` land in `~/.translate/<slug>/chapters/ch01/`.
6. Click Done. Confirm `final.docx` is written.

If all six steps pass, you're done. The author can take it from there.
