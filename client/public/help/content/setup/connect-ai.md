# Connecting an AI: Subscription or OpenRouter

Translate needs at least one way to reach an AI. There are two, and you can use either or both.

## Contents

- [Option A: an AI subscription you already pay for](#option-a-an-ai-subscription-you-already-pay-for)
- [Option B: an OpenRouter API key](#option-b-an-openrouter-api-key)
- [Which to choose](#which-to-choose)
- ["Detected" doesn't mean "signed in"](#detected-doesnt-mean-signed-in)

## Option A: an AI subscription you already pay for

If you have Claude Max, ChatGPT Plus/Pro, Gemini AI Pro, or a free Qwen account, Translate can run rounds through that subscription's **command-line tool**, and those rounds cost **nothing extra**.

You install the tool once and sign in once:

| Your subscription | Install | Sign in |
|---|---|---|
| Claude Max | `npm install -g @anthropic-ai/claude-code` | run `claude` once |
| ChatGPT Plus/Pro | `npm install -g @openai/codex` | run `codex login` |
| Gemini AI Pro | `npm install -g @google/gemini-cli` | run `gemini` once, pick a sign-in method |
| Qwen (free) | `npm install -g @qwen-code/qwen-code` | run `qwen` once |

Those commands need **Node.js** ([nodejs.org](https://nodejs.org/)) — the same tooling the CLIs themselves are built on.

Open **Settings** and you'll see each provider with a green ● **detected** or a grey ○ **not found**. If you just installed one and it still says not found, click **Refresh model list**.

> [!NOTE]
> These are *coding* assistants being used as writing engines. Translate locks them down: it refuses every request they make to read files or run commands, so they can only send text back.

## Option B: an OpenRouter API key

OpenRouter is a paid gateway to hundreds of models — DeepSeek, GLM, Claude, GPT, Gemini and more — billed per use.

1. Sign up at [openrouter.ai](https://openrouter.ai) and add a little credit.
2. Click **Keys**, create one, copy it.
3. Paste it into **Settings → OpenRouter → API key**. It saves when you click away from the field, and the model list refreshes.

Your key is stored on your own machine in a file only your user account can read.

## Which to choose

**Subscription CLIs** cost nothing beyond what you already pay, but each gives you exactly one model — whatever that tool is set to use — and heavy days can hit the subscription's own limits.

**OpenRouter** costs real money per chapter but gives you the whole catalogue with prices and creative-writing scores in front of you, which matters when you're choosing who edits your prose.

A popular arrangement: **Claude Code as the Editor** (free under Max, strong prose) and an **OpenRouter model as the Reviewer** (cheap, and a genuinely different voice).

## "Detected" doesn't mean "signed in"

The green dot only means Translate found the tool installed. It can't tell whether you're logged in. If a round fails with something like:

> Gemini CLI (Gemini AI Pro): Authentication required — run `gemini` once and pick a sign-in method, then try again.

then that's what to do. The message always names the provider and the fix.

## Related

<a href="#" data-goto="setup:choosing-models">→ Choosing Editor and Reviewer Models</a>

<a href="#" data-goto="help:costs">→ What This Costs You</a>
