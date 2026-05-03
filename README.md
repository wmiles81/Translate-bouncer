# Translate

A local web app for AI-assisted bilingual chapter proofreading. You point it at
a translated book (e.g. a German `.docx`) and the English original, and it walks
each chapter through repeated **Editor → Reviewer → Editor (apply suggestions)**
rounds using two AI models you choose, until the translation reads the way you
want it to. When you're happy, click **Done** and Translate writes a final
`.docx` for that chapter.

Everything runs on your own computer. The only outside service it talks to is
[OpenRouter](https://openrouter.ai), which routes prompts to whichever AI model
you pick (Claude, GPT-5, DeepSeek, etc.). Your manuscripts never leave your
machine except as the prompt body sent to OpenRouter for the model you selected.

> **Audience**: Future Fiction Academy members translating their own books.
> See `LICENSE.txt` for the use restriction.

---

## Table of contents

1. [What it does, in plain English](#1-what-it-does-in-plain-english)
2. [One-time setup](#2-one-time-setup)
3. [Starting Translate](#3-starting-translate)
4. [The Settings page (do this first)](#4-the-settings-page-do-this-first)
5. [Adding a book (the New book window)](#5-adding-a-book-the-new-book-window)
6. [The Books list (the home page)](#6-the-books-list-the-home-page)
7. [The Book page](#7-the-book-page)
8. [The Chapter workspace (the editor page)](#8-the-chapter-workspace-the-editor-page)
9. [What a "round" actually does](#9-what-a-round-actually-does)
10. [The Batch row — running many chapters at once](#10-the-batch-row--running-many-chapters-at-once)
11. [Editing the prompts](#11-editing-the-prompts)
12. [Where files live on your computer](#12-where-files-live-on-your-computer)
13. [Stopping the program](#13-stopping-the-program)
14. [Troubleshooting](#14-troubleshooting)
15. [For developers](#15-for-developers)

---

## 1. What it does, in plain English

You have:

- An English book (`.docx`, or a folder of one-`.docx`-per-chapter)
- A first-pass translation of that book into another language (same shape)

Translate splits both books into chapters, lines them up paragraph-for-paragraph,
and lets you walk through each chapter polishing the translation. For each
chapter you click **Continue**, and Translate sends the bilingual paragraphs
to an **Editor model** (e.g. Claude Sonnet) that produces a smoother
translation, then to a **Reviewer model** (e.g. GPT-5) that reads the result
and writes a list of suggestions, then back to the Editor model one more time
to actually apply those suggestions.

You can do this round again as many times as you like. Each round produces a
new working version of the chapter that you can compare against the previous
one side-by-side. When you click **Done**, Translate writes the final chapter
to disk.

You can also do this **in batch** — say "run rounds 4–17 of my book through 2
rounds each, with Claude as Editor and GPT-5 as Reviewer" and walk away. The
status bar shows you exactly what every model is doing, in real time.

---

## 2. One-time setup

You need two things on your computer:

1. **Python 3.11** (or newer) — Translate uses Python under the hood.
   - **Mac**: download the installer at https://www.python.org/downloads/
     and run it.
   - **Windows**: download the installer at https://www.python.org/downloads/
     and run it. **Important**: tick "Add Python to PATH" during install.
   - **Linux**: install via your package manager —
     `sudo apt install python3.11 python3.11-venv` (Debian/Ubuntu),
     `sudo dnf install python3.11` (Fedora), or
     `sudo pacman -S python` (Arch).
2. An **OpenRouter API key** — sign up at https://openrouter.ai, click
   "Keys" in the top-right, and copy a key. Keep it secret. You pay
   OpenRouter for whatever models you actually run; pricing is shown next
   to each model in the Translate model picker.

That's it. You do **not** need Node.js, git, or any developer tools — the
web interface ships pre-built inside the zip.

### Install Translate

1. Download `Translate.zip`.
2. Double-click the zip to unzip it. You'll get a folder called `Translate`.
3. Drag the `Translate` folder somewhere you'll remember — your Documents
   folder, your Desktop, anywhere. **Don't** leave it inside Downloads, or
   macOS may put it in quarantine.

You're done with installation.

---

## 3. Starting Translate

### Mac

Open the `Translate` folder in Finder and **double-click `Launch Translate.command`**.

The first time you do this, macOS may say *"Launch Translate.command cannot
be opened because it is from an unidentified developer."* If so:

1. Right-click `Launch Translate.command` (or Control-click), choose **Open**.
2. macOS will ask once more — click **Open** to confirm.

After that first time, double-click works normally.

### Windows

Open the `Translate` folder in Explorer and **double-click `Launch Translate.bat`**.

If Windows SmartScreen says *"Windows protected your PC"*, click **More info**
then **Run anyway**.

### Linux

Open a terminal in the `Translate` folder and run:

```bash
./launch-translate.sh
```

Or, if your file manager supports it (GNOME Files, Nautilus, Dolphin, Thunar),
right-click `launch-translate.sh` and choose **"Run in Terminal"**. You may
need to mark it executable first with `chmod +x launch-translate.sh`.

### What the launcher does

A Terminal/Console window opens and you'll see something like:

```
Using Python: Python 3.11.7 at /usr/local/bin/python3.11

First-time setup: creating a local Python environment in .venv ...
Installing dependencies (this may take ~30 seconds)...
Setup complete.

Starting Translate. Your browser will open in a moment.
To stop Translate, press Ctrl+C here, or just close this Terminal window.
```

The first launch installs Translate's Python dependencies into a `.venv`
folder inside the Translate folder (~30 seconds, one time only). Every launch
after that skips the install and starts the app immediately.

The launcher then:

1. Picks a free network port (5180, then 5181, etc. if 5180 is busy).
2. Starts a small local web server on that port.
3. Writes its address to `~/.translate/.lock` so a second launch just opens
   the existing browser tab instead of starting twice.
4. Opens your default web browser to the Translate home page.
5. Prints the URL in the terminal so you can copy it into a different browser.

**Leave the Terminal/Console window open while you work — closing it stops
Translate.**

---

## 4. The Settings page (do this first)

From any page, click the **⚙ Settings** button in the top-right.

The Settings page has three sections:

### OpenRouter

- **API key** — paste your OpenRouter key here. The text is hidden (shown as
  dots). Click **Save** to store it. The key is saved to
  `~/.translate/config.json` with file permission `600` (only your user
  account can read it).
- **Refresh model list** — fetches the current list of models from
  OpenRouter. Translate uses this list to populate the model dropdowns and
  show prices. If you change your API key, click this. (It will save the
  key first if you haven't already.)
- The grey number to the right (e.g. "**420 models**") tells you how many
  models OpenRouter currently exposes.

### Default models

These are the models that get pre-filled when you open a new chapter. You
can override them per-chapter from the chapter page.

- **Editor** — the model that does the actual rewriting. Type a model ID
  (`anthropic/claude-sonnet-4`, etc.) or click **Browse…** to pick from a
  searchable list.
- **Reviewer** — the model that reads the editor's output and writes
  suggestions. Pick a *different* model from the editor for the most
  useful critique.

Click **Save** at the bottom of the section.

### The Browse models window

Clicking **Browse…** opens a popup with every OpenRouter model:

- **Search** box at the top — filters by model ID or display name.
- **Sort** dropdown — Provider (default), Release date, Context size.
- **Free only** checkbox — show only models that cost $0.
- **Provider chips** — click one to filter to just that provider; click again
  to clear. Multiple chips can be active at once.
- Each row shows: model name (in **red** if it supports tool use),
  context size in K, and pricing as `$input/$output` per million tokens.
- Click a row to select that model and close the window. Click **Close** or
  click outside to cancel.

### Ingestion (advanced — usually leave alone)

This tells Translate how to detect chapter boundaries inside a single whole-book
`.docx`. If your manuscripts use the standard "Heading 1" Word style for chapter
titles, you can ignore this section.

- **Heading style** — the Word style name that marks a chapter title.
  Default: `Heading 1`.
- **Fallback patterns** — regular expressions, one per line, that also
  count as chapter boundaries when the heading style alone misses them.
  Default patterns recognize "Chapter 1", "Chapter One", "Prologue",
  "Epilogue", and `# Title` markdown.

### Editor / Reviewer prompts

At the bottom: links to **Edit editor prompt** and **Edit reviewer prompt**.
See [section 11](#11-editing-the-prompts) for how those work.

---

## 5. Adding a book (the New book window)

From the Books list (home page), click the **+ New book** button. A modal
window opens.

### Field by field

- **Translated source** — the path to your translated `.docx`, OR a folder
  containing one `.docx` per chapter. Click the **📁 File** button to open
  a native macOS file picker, or **📁 Folder** to pick a folder of chapter
  files. (You can also paste a path; Translate strips wrapping quotes.)
- **English source** — same idea, for the English original.
- **Source language** — what the English file is in. Defaults to **English (en)**.
- **Target language** — what the translated file is in (German, French,
  Spanish, Brazilian Portuguese, etc.). This is used to label paragraphs
  in the bilingual payload sent to the model.

### Buttons

- **Cancel** — close the window without ingesting.
- **Create book** — Translate splits both files into chapters, pairs them
  up by chapter index (chapter 1 of English with chapter 1 of translation,
  etc.), and writes everything into `~/.translate/<your-book-slug>/`. If
  the chapter counts don't match, you'll get an error listing the chapter
  titles found in each file so you can fix the source documents.

The slug is generated from the translated file's name. After ingest, the
book appears in the Books list.

---

## 6. The Books list (the home page)

This is what you see when Translate opens.

- **+ New book** button — top-right. Opens the New book window above.
- **⚙ Settings** button — top-right. Opens Settings.
- **One row per book** — each row shows the book's slug; click anywhere on
  the row to open that book. If no books exist, you see "No books yet."

That's the whole page.

---

## 7. The Book page

Clicking a book row opens its overview.

- **← Books** link — top-left, returns to the home page.
- **Book slug** — large title.
- **Chapter list** — every chapter as a row showing `Ch 01 — Title — status`.
  - Status `untouched` (grey) = no rounds run yet.
  - Status `in_progress` (blue) = at least one round done, not finalized.
  - Status `done` (green) = finalized. The `final.docx` exists.
- Click any chapter row to open the Chapter workspace.

---

## 8. The Chapter workspace (the editor page)

This is where most of the work happens. The page is laid out as four bands
top-to-bottom:

```
┌─────────────────────────────────────────────────────────┐
│ Top bar        [chapter ▾]  Editor ▾  Reviewer ▾  ⚙     │
├──────────────┬──────────────────┬───────────────────────┤
│  English     │  Working (target)│  Suggestions / Dialog │
│              │                  │                       │
├──────────────┴──────────────────┴───────────────────────┤
│ Batch row     [from][to][skip done][rounds][finalize] [Run batch] │
├─────────────────────────────────────────────────────────┤
│ Activity log (scrolling)                                │
│ Status line + [Continue] [Done]                          │
└─────────────────────────────────────────────────────────┘
```

### The top bar

- **← Book** — go back to the book overview.
- **Chapter** dropdown — jump to any chapter without leaving the workspace.
  Items show as `Ch 03 / 17`.
- **Editor** picker — model used for editor passes in this chapter. Defaults
  to your global default; change per chapter as you like.
- **Reviewer** picker — same idea for the reviewer.
  - Picker rows show: name (in **red** if the model supports tools), context
    size, and pricing `$input/$output` per million tokens.
- **⚙ Settings** — opens Settings.

### The three panes

**Left — English.** Read-only. The English source paragraphs.

**Middle — Working.** The current target-language version. After Round 1
this is the editor's first translation; after Round 2 it incorporates the
Round-1 reviewer's suggestions; and so on. **Inline strike-through and
underline diffs** show what changed since the previous round.

**Right — Suggestions / Dialog.** Has two tabs at the top-right:

- **Suggestions** (default) — the most recent reviewer's list of
  suggestions, each shown as a quote from the working text plus the
  reviewer's comment.
- **Dialog** — the full back-and-forth between the editor and reviewer for
  every round, with the raw text each model returned. Three collapsible
  sections per round:
  - *Editor* (raw text the editor produced)
  - *Reviewer* (raw text the reviewer produced)
  - *Suggestions extracted* (the parsed suggestion list)

  Use this when something looks wrong and you want to see exactly what the
  models said.

### The Batch row

Compact controls for running many rounds and many chapters at once.
See [section 10](#10-the-batch-row--running-many-chapters-at-once).

### The activity log + status bar (bottom)

A scrolling log shows every action with timestamps:

```
14:02:15  Ch 3 R2 → Editor (anthropic/claude-opus) · source: round 1 editor output
14:04:31  Ch 3 R2 ← Editor returned
14:04:31  ✓ Ch 3 R2 editor complete
14:04:31  Ch 3 R2 → Reviewer (z-ai/glm-4.7) · source: round 2 editor output
14:07:51  Ch 3 R2 ← Reviewer returned 21 suggestions
14:07:51  ✓ Ch 3 R2 reviewer complete
```

- Grey lines are in-progress events; green lines are completions; red
  lines are errors.
- Below the log: a single status line shows the most recent event plus
  elapsed seconds when a model is running, plus two buttons:
  - **Continue** — run one round of *Editor → Reviewer → Editor (apply)*.
    Disabled while busy. See [section 9](#9-what-a-round-actually-does).
  - **Done** — finalize the chapter. Writes `final.docx` and marks the
    chapter `done`. Disabled until at least one round has run.

---

## 9. What a "round" actually does

When you click **Continue**, Translate makes up to three calls in sequence:

1. **Editor pass** — sends the current working translation (plus any prior
   reviewer's suggestions) to the editor model. The model returns a fresh
   bilingual rendering. Translate parses it and writes
   `round-N-editor.docx` and `round-N-editor.json` to disk.
2. **Reviewer pass** — sends the new editor output to the reviewer model
   asking it to suggest improvements. The model returns a JSON list of
   `{quote, comment}` suggestions. Translate parses and saves those as
   `round-N-reviewer.json`.
3. **Apply pass (a second editor pass)** — sends those suggestions back
   to the editor model so the suggestions actually get incorporated into
   the prose. The result becomes `round-(N+1)-editor.docx`.

If you click **Continue** again right away, Translate notices the chapter
already has an editor pass that hasn't been reviewed (the apply pass from
the previous round), so it **skips the leading editor call** and goes
straight to Reviewer + Apply. Each subsequent click costs you one Reviewer
call and one Editor call — no wasted work.

The **working pane** always shows the latest editor output. The
**previous round** is whatever editor output came right before it, which
is what the inline diff is computed against.

You can run as many rounds as you want; each one is saved to disk
separately, so nothing is lost.

When you're happy, click **Done**. Translate copies the latest editor
output to `final.docx` in the chapter's folder and flips the chapter
status to `done`. The Done button is disabled until you've run at least
one round.

---

## 10. The Batch row — running many chapters at once

The batch row sits between the panes and the status bar.

### Fields

- **From** / **To** — chapter range (inclusive). Defaults to "current
  chapter through the end."
- **Skip done** — checkbox. When on, chapters already marked `done` are
  skipped.
- **Rounds** — how many full rounds (Editor → Reviewer → Editor-apply) to
  run on each chapter. Default `2`.
- **Finalize each** — checkbox. When on, every chapter is finalized
  immediately after its last round.
- **N chapters × M** — read-out telling you how many chapters will run
  and how many rounds each.

### Buttons

- **Run batch** — disabled until you've picked an editor model, a reviewer
  model, and at least one chapter is selected. Click to start.
- **Stop after current chapter** — replaces "Run batch" while a batch is
  running. Click to stop *gracefully* (the current chapter completes; no
  new chapter is started). The in-flight model call is **not** cancelled.

### What you see while running

The activity log (right below the batch row) updates live:

- Each chapter starts with a blue/grey line: `▶ Batch ch 4 (1/14): Title`.
- Every model call streams its sent / returned events.
- Each chapter ends with: `✓ Batch ch 4 done` (green) or `⚠ Batch ch 4: <error>` (red).
- The whole batch ends with: `✓ Batch complete`.

Errors on one chapter don't stop the batch. The next chapter still runs.

You can keep clicking around the workspace while a batch runs — switch
chapters, toggle to the Dialog tab, etc. Just don't close the browser tab
or the Terminal window.

---

## 11. Editing the prompts

Translate ships with default Editor and Reviewer prompts that work for most
fiction. If you want to customize them, go to **⚙ Settings → Edit editor
prompt** (or **Edit reviewer prompt**).

The prompt page has:

- A large text area showing the **current** prompt.
- **Save as new version** — writes your changes as a new version, sets it
  current. Old versions stay on disk.
- **Version history** — a list of every saved version with timestamps.
  - **Restore** — make a past version current again.
  - **Delete** — permanently remove a non-current version.

Templates use a couple of substitution tokens that Translate fills in at
runtime — `{TARGET_LANG_CODE}`, `{TARGET_LANG_NAME}`, `{SOURCE_LANG_NAME}`.
Don't remove these.

---

## 12. Where files live on your computer

Everything Translate stores is under `~/.translate/`:

| Path | What it is |
|------|------------|
| `~/.translate/config.json` | Your API key, default models, and ingestion patterns. Permission `600`. |
| `~/.translate/prompts/editor.json` | Editor prompt and full version history. |
| `~/.translate/prompts/reviewer.json` | Reviewer prompt and full version history. |
| `~/.translate/.lock` | Single-instance lock (PID + URL). Deleted when Translate quits cleanly. |
| `~/.translate/<book-slug>/book.json` | This book's metadata (sources, language pair, chapter list). |
| `~/.translate/<book-slug>/source-en/chNN.json` | Parsed English chapter (paragraphs + styles). |
| `~/.translate/<book-slug>/source-translated/chNN.json` | Parsed first-pass translation. |
| `~/.translate/<book-slug>/chapters/chNN/round-K-editor.docx` | The editor's output for round K, as Word. |
| `~/.translate/<book-slug>/chapters/chNN/round-K-editor.json` | Same, as parsed JSON. |
| `~/.translate/<book-slug>/chapters/chNN/round-K-editor.raw.txt` | The literal text the editor returned. Useful for debugging parse failures. |
| `~/.translate/<book-slug>/chapters/chNN/round-K-reviewer.json` | The reviewer's parsed suggestions for round K, plus raw response. |
| `~/.translate/<book-slug>/chapters/chNN/chNN.json` | Chapter metadata (status, current round, models used per round, prompts used per round). |
| `~/.translate/<book-slug>/chapters/chNN/final.docx` | Written when you click Done. The shippable result. |

**You can copy or delete a book by copying or removing its folder.**
Deleting `~/.translate/<book-slug>/` permanently removes that book and all
its rounds.

---

## 13. Stopping the program

Three ways:

1. In the Terminal window where you ran `translate`, press **Ctrl+C**.
2. Or close the Terminal window. (Same effect.)
3. Or, if Translate seems frozen, find its process and kill it:
   ```bash
   cat ~/.translate/.lock      # shows {"pid": 12345, ...}
   kill 12345                  # gentle stop
   kill -9 12345               # force stop if the gentle one didn't work
   rm ~/.translate/.lock       # remove the stale lock file
   ```

Closing the browser tab does **not** stop the program — the server keeps
running. Reopen the URL printed in the terminal to come back.

---

## 14. Troubleshooting

**"OpenRouter rejected the API key (401)"** — your key is missing or wrong.
Settings → OpenRouter → API key, paste a fresh key, click **Save**.

**"HTTP 422: expected N blocks, found 0"** — the editor model returned text
in a format Translate couldn't parse. The raw response is saved to
`~/.translate/<book-slug>/chapters/chNN/round-K-editor.raw.txt`. Open the
**Dialog** tab in the right pane to see what the model actually said. Often
this is a smaller / cheaper model getting the format wrong; pick a stronger
editor model and click Continue again.

**"HTTP 502" / "transient"** — OpenRouter or the underlying provider had a
hiccup. Translate already retries three times automatically (1s, 2s, 4s
backoff). If you still see this, just click Continue again.

**"Model not available: …"** — the model ID you picked isn't routable on
your OpenRouter plan. Open Settings → Browse and pick a different one.

**Activity log is empty / nothing happens when I click Continue** — make
sure your API key is saved (Settings) and that the editor and reviewer
model dropdowns in the top bar both show a model. If they're blank, set
defaults in Settings or pick from the dropdowns directly.

**The browser tab shows "404 Not Found"** — the web interface wasn't built.
Run `cd client && npm install && npm run build` then refresh the tab.

**"This file picker won't show my Google Drive .docx file"** — make sure
the file is actually downloaded to your computer (not just a Google
Docs link). Drive desktop sometimes shows files greyed-out until they
finish downloading.

**"My round is taking forever"** — slow models (Opus, large reasoning
models) can take several minutes per call. Translate's elapsed-seconds
counter shows you it's still alive. The HTTP timeout is 10 minutes per
call; if you hit that, it counts as transient and gets retried.

---

## 15. For developers

### Working from source

End users get the pre-built zip. Developers cloning the repo need:

- Python 3.11+
- Node.js 18+ and npm
- (optional) `git`

Install:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cd client
npm install
npm run build
cd ..
```

Then start:

```bash
.venv/bin/translate
```

### Building the distributable zip

```bash
./scripts/package.sh
```

Output lands at `release/Translate.zip`. The script rebuilds the web UI,
stages the Python source, copies the launchers and `LICENSE`/`README`/
`QUICK_START`, and zips the lot. End users only need to download that
zip — they don't need Node or git.

### Project layout

```
server/                    Python FastAPI server
  main.py                  app factory, lock-file, CLI entry point
  config.py                Pydantic config model + load/save
  ingest.py                book ingestion (chapter splitting, pairing)
  chapter_split.py         Word .docx chapter detection
  docx_io.py               .docx ↔ ParsedDoc conversion
  payload.py               bilingual payload renderer + tolerant parser
  prompts.py               editor/reviewer prompts + version history
  rounds.py                editor/reviewer pass orchestration
  finalize.py              writes final.docx
  openrouter.py            HTTP client with retry and 600s timeout
  routes/                  FastAPI route modules
client/                    React + Vite + TypeScript SPA
  src/views/               BookListRoute, BookViewRoute, ChapterRoute,
                           SettingsRoute, NewBookModal, BatchRunModal
  src/components/          TopBar, StatusBar, BatchControls,
                           ModelPicker, ModelBrowser, EnglishPane,
                           WorkingPane, SuggestionsPane, DiffView, …
  src/lib/                 batchRunner, modelDisplay, languages, diff
  src/api/                 small fetch wrappers per resource
  src/hooks/               useBook, useChapter, useEvents, useModels, useSettings
tests/server/              pytest suite (106+1 skipped)
docs/                      design docs and plans
```

### API surface

- `GET  /health` — liveness check
- `GET  /settings`, `PUT /settings` — config
- `GET  /models` — proxied OpenRouter model list
- `GET  /prompts/{kind}`, `PUT /prompts/{kind}` — prompts with version history
  - `POST /prompts/{kind}/restore/{version_id}`
  - `DELETE /prompts/{kind}/{version_id}`
- `GET  /books`, `POST /books`, `GET /books/{slug}` — list, ingest, get state
- `GET  /books/{slug}/chapter/{n}/state` — chapter state
- `POST /books/{slug}/chapter/{n}/round/editor` — run an Editor pass
- `POST /books/{slug}/chapter/{n}/round/reviewer` — run a Reviewer pass
- `POST /books/{slug}/chapter/{n}/finalize` — write `final.docx`, mark done
- `GET  /books/{slug}/chapter/{n}/docs` — parsed paragraph data for the panes
- `GET  /books/{slug}/chapter/{n}/dialog` — per-round raw model exchanges
- `GET  /events` — Server-Sent Events stream (round progress, retries, errors)
- `POST /system/pick-path` — invoke the native macOS file/folder picker

### Running in dev mode

```bash
# Terminal 1: server with no auto-browser
.venv/bin/translate --no-browser

# Terminal 2: Vite dev server (proxies /health, /books, /events, … to :5180)
cd client && npm run dev
```

Vite serves on http://localhost:5173 with hot reload. API calls are
proxied to the Python server.

### Tests

```bash
.venv/bin/python -m pytest tests/server/ -v   # 106 passed, 1 skipped
cd client && npm test                          # 95 tests
```

### Contributing

This project is internal to GML Publishing LLC and the Future Fiction Academy
member community. See `LICENSE.txt` for the terms of use. External pull
requests are not accepted; bug reports from FFA members are welcome through
your usual support channel.

---

© 2026 GML Publishing LLC. All rights reserved.
