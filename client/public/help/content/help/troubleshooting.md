# Troubleshooting: Common Problems

## Contents

- [A provider says "not found"](#a-provider-says-not-found)
- ["Authentication required"](#authentication-required)
- ["This model requires a newer version"](#this-model-requires-a-newer-version)
- ["No OpenRouter API key is configured"](#no-openrouter-api-key-is-configured)
- [A round retries, then fails](#a-round-retries-then-fails)
- [A round seems stuck](#a-round-seems-stuck)
- [Chapter count mismatch on import](#chapter-count-mismatch-on-import)
- ["Translate is already running"](#translate-is-already-running)
- [The browser page looks wrong or out of date](#the-browser-page-looks-wrong-or-out-of-date)
- [Nothing here helped](#nothing-here-helped)

## A provider says "not found"

Settings shows a grey ○ because Translate can't find that tool on your computer. Either it isn't installed, or it was installed somewhere Translate doesn't look.

Install it (see <a href="#" data-goto="setup:connect-ai">Connecting an AI</a>), then click **Refresh model list**. If you installed it while Translate was running, quit and relaunch — new programs don't always appear to a running app.

Claude Code and Codex each need **two** things present: their own CLI *and* Node's `npx`. Installing Node fixes the second.

## "Authentication required"

The tool is installed but you're not signed in. The message names the provider and the exact fix, for example:

> Gemini CLI (Gemini AI Pro): Authentication required — run `gemini` once and pick a sign-in method (or set GEMINI_API_KEY), then try again.

Open a terminal, run that command, sign in, then retry the round. You only do this once per machine.

## "This model requires a newer version"

The model you picked is newer than the connector that drives it. Full message:

> The 'gpt-5.6-sol' model requires a newer version of Codex … pick an older model in the picker, or update the CLI and its ACP adapter.

**Pick a slightly older model** from the same provider — for Codex, GPT-5.5 works. This is upstream: the connector catches up in its own time, and when it does the newer models start working with no change on your side.

## "No OpenRouter API key is configured"

You picked a model that routes through OpenRouter without a key saved. Either paste a key in **Settings → OpenRouter**, or choose a model from a detected CLI provider instead.

This also happens with a **saved default from an older setup**. The message names the model so you can see which one it is; just pick a current model in Settings.

## A round retries, then fails

`retry 2/3…` means a temporary problem — a network blip, a busy provider — and Translate tries three times before giving up. If all three fail:

- **Wait a few minutes and click Continue.** Providers recover.
- **Check your subscription limits.** Codex in particular has a daily cap; when you hit it, rounds fail until it resets. Switch to another provider or come back later.
- **Try a different model.** If one model fails repeatedly while another works, it's the model, not you.

Nothing is lost — the chapter stays at its last completed round.

## A round seems stuck

Watch the **elapsed timer**. Some models think for several minutes on a long chapter, especially "thinking" models (the red ones).

Translate gives any single pass **ten minutes** before calling it a timeout and retrying. If you don't want to wait, click **Stop now** in a batch run, or just leave it — it will resolve itself one way or the other.

A pass that times out three times usually means the provider is degraded. Try another model.

## Chapter count mismatch on import

Translate found a different number of chapters in your two documents and refuses to pair them up wrongly. The error lists what it found on each side. See <a href="#" data-goto="start:add-a-book">Adding a Book</a> for how to fix it.

## "Translate is already running"

Usually true — check your other browser tabs and Terminal windows.

If it definitely isn't running (the computer restarted, or the Terminal was force-quit), a stale marker file was left behind. Delete `~/.translate/.lock` and launch again.

## The browser page looks wrong or out of date

Reload the tab (**⌘R** / **Ctrl+R**). If the app was updated while the tab was open, the tab keeps the old version until you reload.

If the page won't load at all, check the Terminal window: if it's closed or shows an error, Translate isn't running — start it again.

## Nothing here helped

The Terminal window is the place to look — errors print there in full. Copy the last twenty lines or so when reporting a problem, along with which models you were using and what you clicked.

## Related

<a href="#" data-goto="setup:connect-ai">→ Connecting an AI</a>

<a href="#" data-goto="setup:choosing-models">→ Choosing Editor and Reviewer Models</a>
