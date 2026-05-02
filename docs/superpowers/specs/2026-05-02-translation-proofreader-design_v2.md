# Translation Proofreader — Design Spec

**Date:** 2026-05-02
**Status:** Approved (pending user spec review)
**Revision:** v2 — added single-instance enforcement (§2 Launcher / §2 Single-instance enforcement)

## 1. Purpose and Scope

### Purpose

A local web app that produces polished proofread chapters of a translated novel as voice samples to send back to Scribeshadow. The user points it at two inputs — the **translated book** and the **English original** — and it sets up a chapter-level workspace where any chapter can be proofed through a multi-round Editor → Reviewer loop. Both AIs see the English original alongside the translation, so proofing preserves the author's voice/style/tone instead of polishing the translation in isolation.

### In scope

- Two-input ingestion: paths to a translated-book source and an English-original source
- Auto-detect input format per source: folder-of-chapter-`.docx`, or single whole-book `.docx` (split by heading)
- Always work at chapter level inside the app — never the whole book at once
- Chapter pairing between English and translated sources by ordinal index, with a count-mismatch warning
- Per-chapter work folder with full round-by-round history on disk (traceability)
- Chapter selector in the workspace; user picks which chapter to work on at any time
- Each chapter has independent state — multiple chapters can be in different states (untouched / in-progress / done)
- Workspace shows English source (read-only) + working translation + Reviewer suggestions + diff toggle
- Editor and Reviewer pass both texts (English + translation) to the model each round
- Two model dropdowns at the top of the workspace, swappable on the fly
- Editable Editor/Reviewer prompts with version history, incorporating bilingual context
- Auto-retry with backoff on API failures; live status bar
- One book in flight at a time in the UI; multiple chapters in flight per book is fine
- Single-instance enforcement: only one server may run at a time against `~/.translate/`
- Preserve `.docx` formatting at: paragraphs, italic, bold, headings. Strip everything else.

### Out of scope

- Tracked changes, comments, footnotes, tables, images, hyperlinks
- User accounts, cloud sync, multi-device
- Hard-cap or auto-stop loop logic
- Prompt templates, per-chapter prompt overrides
- Working on more than one *book* at a time
- Manual chapter pairing UI (we pair by order; if counts differ, we flag and the user fixes the source)
- Manual "redo" button for successful-but-bad rounds (auto-retry handles failure; bad rounds get rolled back via files or by clicking Continue again)
- Multiple concurrent app instances (see §2 Single-instance enforcement)

## 2. Architecture

Two pieces talking over HTTP on `localhost`:

```
┌──────────────────────┐         ┌──────────────────────────┐
│  Browser (UI)        │ ◄────► │  Local server            │
│  - workspace view    │  HTTP   │  - chapter parsing       │
│  - book view         │   +     │  - chapter splitting     │
│  - settings          │  SSE    │  - OpenRouter calls      │
│  - status bar        │         │  - file I/O (~/.translate)│
│                      │         │  - prompt versioning     │
└──────────────────────┘         └──────────────────────────┘
                                            │
                                            ▼
                                   ~/.translate/
```

### Server (Python + FastAPI)

- Native `python-docx` for Word handling (most reliable `.docx` library available)
- Async-friendly for long-running model calls
- Endpoints (rough):
  - `POST /book` — ingest (takes two source paths, returns book slug + chapter list)
  - `GET /book/<slug>` — book state (chapter list with statuses)
  - `GET /book/<slug>/chapter/<n>/state` — full state of one chapter
  - `POST /book/<slug>/chapter/<n>/round/editor`
  - `POST /book/<slug>/chapter/<n>/round/reviewer`
  - `POST /book/<slug>/chapter/<n>/finalize`
  - `GET/PUT /settings`
  - `GET/PUT /prompts`
- Reads/writes everything under `~/.translate/`. Holds the OpenRouter API key in `~/.translate/config.json` (mode 600). Key never goes to the browser.
- Auto-retry with exponential backoff on OpenRouter calls (3 attempts: 1s, 2s, 4s).
- Streams progress events to the browser over Server-Sent Events (one connection per session) so the status bar updates live.
- Includes ingestion module: detects format per side, splits whole-book `.docx` by heading, writes per-chapter files into source folders.
- Tracks chapter state machine: `untouched → in_progress → done`.

### Browser (React + Vite)

- Single-page app with two views: **Book view** (chapter list) and **Chapter workspace** (3-pane proofing UI)
- No accounts, no auth — talks only to its own localhost server
- All UI state derived from server state endpoints (single source of truth lives on disk)

### Launcher

- One command: `translate`. Wraps starting the server, picking a free port, and opening the browser.
- Installable via `pipx install translate` (or similar).
- On second launch: detects the running instance via the lock file (see Single-instance enforcement below), opens a new browser tab pointing at the existing server's URL, and exits without starting a second server.

### Single-instance enforcement

Only one app instance may run against `~/.translate/` at any time. Multiple browser tabs are fine — they all talk to the same server — but only one server process exists.

**Implementation:**

- On startup, the server tries to acquire an exclusive file lock on `~/.translate/.lock`. The lock file contains the running server's PID and bound URL (e.g. `http://localhost:5180`).
- If the lock is already held: the new launcher reads the existing server's URL from the lock file, opens that URL in the browser, and exits without starting a second server.
- If the lock file exists but the recorded PID is dead (stale lock from a crashed prior run): the new server takes over, overwrites the lock with its own PID and URL.
- On graceful shutdown, the server releases the lock and removes the file.

**Why this matters:**

- Prompts (`~/.translate/prompts/`) and config (`~/.translate/config.json`) are global state. Two servers writing them concurrently would race.
- Per-book working folders (`~/.translate/<book>/`) would be at risk of corruption if two instances opened the same book.
- A single server with multiple browser tabs is a clean multi-window UX without any of the concurrency hazards.

**What this means for the user:**

- Want a second window? Open a new browser tab pointing at the same `localhost:<port>` URL — both tabs share state in real time via the same server.
- Want to reset? Quit the server (close terminal or kill process), the lock auto-clears.

### Trade-off acknowledged

Two languages in the codebase (Python + TypeScript). Slightly more setup than a pure-Python or pure-Node app. Worth it because: `python-docx` is the most reliable `.docx` library available, and React makes the 3-pane workspace much cleaner than raw HTML/JS.

### Source-control hygiene

The app's source repo will include a `.gitignore` that excludes:

- Any local `.env` files
- Any `~/.translate/` symlinks accidentally placed inside the repo
- `**/config.json` patterns that could collide with user state
- Standard Python/Node ignores (`__pycache__/`, `node_modules/`, `dist/`, `.venv/`)

User state under `~/.translate/` lives outside the repo by default and is never auto-committed. The `.gitignore` is defensive in case a developer ever symlinks state into the working tree for testing.

## 3. Data Model and File Layout

```
~/.translate/
├── .lock                               # contains running server PID + URL; auto-cleared on shutdown
├── config.json                         # mode 600, never read by browser
├── prompts/
│   ├── editor.json                     # current + version history
│   └── reviewer.json
└── <book-slug>/
    ├── meta.json                       # book-level state
    ├── source-en/                      # English chapters (read-only, never modified after ingest)
    │   ├── ch01.docx
    │   ├── ch01.json
    │   ├── ch02.docx
    │   ├── ch02.json
    │   └── ...
    ├── source-translated/              # Translated chapters as ingested (read-only)
    │   ├── ch01.docx
    │   ├── ch01.json
    │   └── ...
    └── chapters/
        ├── ch01/                       # Work area for chapter 1
        │   ├── meta.json               # chapter-level state
        │   ├── round-1-editor.docx
        │   ├── round-1-editor.json
        │   ├── round-1-reviewer.json
        │   ├── round-2-editor.docx
        │   ├── round-2-editor.json
        │   ├── round-2-reviewer.json
        │   ├── ...
        │   └── final.docx              # written when user clicks Done
        ├── ch02/
        │   └── meta.json               # exists only once chapter is touched
        └── ...
```

**Slug derivation.** `<book-slug>` is derived from the translated source's filename (or folder name): stripped of extension, lowercased, spaces→hyphens, illegal chars removed. If a folder with that slug already exists, the app prompts: **Resume** (load existing state) or **New session** (create `<book-slug>-2`, etc.). No silent overwrites.

### Book-level `meta.json`

```json
{
  "slug": "le-voleur-de-pluie",
  "created_at": "2026-05-02T14:23:00",
  "sources": {
    "translated": { "path": "/path/to/translated/", "format": "folder" },
    "english":    { "path": "/path/to/english/book.docx", "format": "single-docx" }
  },
  "language_pair": { "from": "en", "to": "fr" },
  "chapters": [
    { "n": 1, "title": "Chapitre 1", "status": "in_progress" },
    { "n": 2, "title": "Chapitre 2", "status": "untouched" },
    { "n": 3, "title": "Chapitre 3", "status": "done" }
  ]
}
```

### Chapter-level `chapters/chN/meta.json`

```json
{
  "n": 1,
  "status": "in_progress",
  "current_round": 3,
  "models": {
    "editor": "anthropic/claude-sonnet-4",
    "reviewer": "openai/gpt-5"
  },
  "prompts_used": {
    "editor_version": "v4",
    "reviewer_version": "v2"
  },
  "rounds": [
    { "n": 1, "editor_completed_at": "...", "reviewer_completed_at": "..." },
    { "n": 2, "editor_completed_at": "...", "reviewer_completed_at": "..." },
    { "n": 3, "editor_completed_at": "...", "reviewer_completed_at": null }
  ]
}
```

### Parsed-text JSON (`source-en/chN.json`, `source-translated/chN.json`, `round-N-editor.json`)

The intermediate representation used as input to the model and as the basis for re-emitting `.docx`:

```json
{
  "paragraphs": [
    { "style": "heading-1", "text": "Chapitre 1" },
    { "style": "normal", "text": "Le matin où **tout commença**, il pleuvait encore." },
    { "style": "normal", "text": "*Pourquoi moi ?* pensa-t-elle." }
  ]
}
```

Italic and bold are encoded inline as `*…*` / `**…**`. Headings are captured by `style`, not by inline markup.

### Reviewer suggestions: `round-N-reviewer.json`

```json
{
  "round": 2,
  "model": "openai/gpt-5",
  "completed_at": "...",
  "suggestions": [
    { "id": 1, "quote": "...", "comment": "..." },
    { "id": 2, "quote": "...", "comment": "..." }
  ],
  "raw_response": "..."
}
```

`raw_response` is always preserved so a parse failure still leaves usable data on disk.

### Global config: `~/.translate/config.json`

```json
{
  "openrouter_api_key": "sk-or-...",
  "default_models": {
    "editor": "anthropic/claude-sonnet-4",
    "reviewer": "openai/gpt-5"
  },
  "ingestion": {
    "heading_style": "Heading 1",
    "fallback_patterns": [
      "^Chapter\\s+\\d+",
      "^Chapitre\\s+\\d+",
      "^Capítulo\\s+\\d+",
      "^Chapter\\s+[IVXLCM]+"
    ]
  }
}
```

Mode `600`. The browser never sees the API key.

### Prompt versions: `~/.translate/prompts/`

Each prompt file:

```json
{
  "current": "v4",
  "versions": [
    { "id": "v1", "saved_at": "...", "text": "..." },
    { "id": "v2", "saved_at": "...", "text": "..." },
    { "id": "v3", "saved_at": "...", "text": "..." },
    { "id": "v4", "saved_at": "...", "text": "..." }
  ]
}
```

Restoring a past version creates a *new* entry with that text and promotes it to current — never deletes anything.

## 4. Workspace UI

### Book view (entry after selecting/loading a book)

```
┌────────────────────────────────────────────────────────────┐
│ Book: Le Voleur de Pluie  [+ New book]    ⚙ Settings       │
├────────────────────────────────────────────────────────────┤
│ Sources:                                                   │
│   English:    /path/to/english/book.docx                   │
│   Translated: /path/to/translated/                         │
│                                                            │
│ Chapters (12):                                             │
│   Ch 01  Chapitre 1            ● done       [open]         │
│   Ch 02  Chapitre 2            ○ in progress (round 3)     │
│   Ch 03  Chapitre 3            untouched   [open]          │
│   Ch 04  Chapitre 4            untouched   [open]          │
│   ...                                                      │
└────────────────────────────────────────────────────────────┘
```

### Chapter workspace (when a chapter is opened)

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Book  |  Ch 02 / 12  ▼   Editor [Sonnet 4 ▼]  Reviewer [GPT-5 ▼] │
├──────────────────────────────────────────────────────────────────┤
│  English source     │  Working translation │  Reviewer suggests  │
│  (read-only)        │  (round 3)           │  (round 3)          │
│                     │                      │                     │
│  Chapter 2          │  Chapitre 2          │  1. ...             │
│                     │  [show diff vs r2 ☐] │  2. ...             │
│  The morning when   │  Le matin où tout    │  3. ...             │
│  it all began,      │  commença, il pleu-  │                     │
│  it was still       │  vait encore. ...    │                     │
│  raining. ...       │                      │                     │
│                     │                      │                     │
├──────────────────────────────────────────────────────────────────┤
│ Status: ✓ Round 3 complete            [ Continue ]   [ Done ]    │
└──────────────────────────────────────────────────────────────────┘
```

### Top bar

- **← Book** — return to book view
- **Chapter selector** — dropdown showing `Ch N / Total`, jump to any chapter without going back
- **Editor model dropdown** — populated from cached OpenRouter model list, defaults from settings; changing updates this chapter's `meta.json` and applies to the *next* call
- **Reviewer model dropdown** — same
- **⚙ Settings** — opens settings page (modal or separate route)

### Three panes

- **English source** (~33% width, read-only, fixed) — paragraphs rendered with italic/bold/heading styling
- **Working translation** (~33%, with `Show diff vs round N-1` toggle) — current Editor output; diff view shows insertions green and deletions red strikethrough, off by default
- **Reviewer suggestions** (~33%, collapsible) — numbered list of the most recent Reviewer's suggestions; collapse icon expands the working translation pane to fill the freed space

### Pane scrolling

Independent scroll by default, with a gutter toggle to **Lock scroll** (English ↔ Working translation scroll together by paragraph index). Useful for paragraph-by-paragraph cross-reference.

### Status bar

Live progress text on the left:

- `Idle`
- `Round 3 — calling Editor (anthropic/claude-sonnet-4)...`
- `Round 3 — Editor complete, calling Reviewer (openai/gpt-5)...`
- `Round 3 — retry 2/3...`
- `✓ Round 3 complete`
- `⚠ Editor call failed after 3 retries: <error>`

Two buttons on the right:

- **Continue** — runs another round; disabled while a round is in flight
- **Done** — enabled any time at least one round has completed; clicking writes `final.docx`, marks the chapter `done`, and shows confirmation

### Interaction details

- **Initial round 1**: when no rounds have run yet, the working translation pane shows the source-translated text. Clicking Continue kicks off round 1 (Editor pass on the source-translated, then Reviewer pass on Editor's output).
- **Mid-round model swap**: changing a dropdown while a round is running has no effect on the current call (it finishes with the model it started with). The new model applies to the next call.
- **Resuming a chapter**: opening an existing chapter loads its `meta.json` and the latest round's files. The user sees exactly the state they left it in.
- **Resuming after retry exhaustion**: chapter state stays at "round N-1 complete" — the failed round leaves no artifacts. Clicking Continue retries the failed *pass* (Editor or Reviewer), not the whole round.
- **Multiple browser tabs**: opening additional tabs at the same server URL is supported. All tabs share live state via the server. Each tab can navigate independently (e.g. one on Ch 2, one on Ch 5).

## 5. Prompt-Flow Logic and Bilingual Prompts

### One round = one Editor pass, then one Reviewer pass

Both passes receive the **same bilingual payload**: English source + current translation, paragraph-aligned.

### Bilingual payload format

Line prefixes are the uppercase two-letter language codes from the book's `language_pair` (e.g., `EN`/`FR` for English→French, `EN`/`ES` for English→Spanish). Below uses `EN`/`FR` as an example:

```
[1]
EN: The morning when it all began, it was still raining.
FR: Le matin où tout commença, il pleuvait encore.

[2]
EN: "Why me?" she thought.
FR: "Pourquoi moi ?" pensa-t-elle.

[3]
...
```

- One block per paragraph, aligned by ordinal index
- Italic and bold encoded inline as `*…*` / `**…**`
- Headings prefixed with `# ` on the line
- For round 1, the target-language line is the source-translated text; for round N>1, it's the most recent Editor output

### Editor pass

- **Input**: bilingual payload + Editor system prompt + (if round N>1) the previous Reviewer's suggestions list embedded as user-message context
- **Expected output**: the same paragraph-aligned format with **only the target-language lines** (one per paragraph, in order); no commentary
- **Parsing**: split on `[N]` markers, extract the target-language line from each block, reassemble into parsed-paragraph JSON. If paragraph count is wrong, surface a "recoverable error" with a Retry affordance — never silently re-align.
- **Output**: `chapters/chN/round-N-editor.docx` and `.json`

### Reviewer pass

- **Input**: bilingual payload (Editor's output as the target-language line) + Reviewer system prompt
- **Expected output**: structured JSON list of suggestions, each with `quote` and `comment`
- **Format enforcement**: prefer OpenRouter's structured-output / JSON-schema feature where supported; for models that don't support it, ask for JSON in-prompt and parse, falling back to raw text in `raw_response` if parsing fails
- **Output**: `chapters/chN/round-N-reviewer.json`

### Editor prompt (proposed v1, editable in settings)

The prompt is rendered with `{TARGET_LANG_CODE}` and `{TARGET_LANG_NAME}` substituted from the book's `language_pair` (e.g., `FR` and `French`).

> You are proofreading a chapter of a novel that has been translated by AI into {TARGET_LANG_NAME}. You will receive the English original and the current translation, paragraph by paragraph and aligned by index.
>
> Proof the translation only. Do not edit the book itself — do not change plot, characters, voice, pacing, or authorial choices. Your job is linguistic, not editorial.
>
> Use the English source as a reference for the author's voice, style, and tone. Fix awkward phrasing, unnatural word order, translation artifacts, register mismatches, idioms that don't land, and anything that sounds machine-translated. Preserve the author's style and tone — if the original is informal, stay informal; if it's literary, stay literary.
>
> If a previous reviewer's suggestions are provided, incorporate the ones you agree with and ignore those you don't. Do not explain your decisions.
>
> Return only the revised translation, in the exact paragraph-aligned format you received, with one `{TARGET_LANG_CODE}:` line per paragraph and nothing else.

### Reviewer prompt (proposed v1, editable in settings)

Same `{TARGET_LANG_NAME}` substitution as the Editor prompt.

> You are reviewing a chapter of a novel that has been translated by AI into {TARGET_LANG_NAME} and then proofread. You will receive the English original and the current translation, paragraph by paragraph and aligned by index.
>
> Identify what should change to make the translation read like it was written by a native speaker of the target language while remaining faithful to the author's voice, style, and tone in the English source. Do not suggest editorial changes — your suggestions must be linguistic, not creative.
>
> The user does not speak the target language. Communicate to them in English.
>
> Return a JSON list of suggestions. Each entry must have `quote` (the translation snippet to change) and `comment` (what should change and why). Return only the JSON list, no preamble or commentary.

### Round loop (mechanics)

```
[user clicks Continue]
  ↓
status: "Round N — calling Editor (model)..."
  ↓
Editor pass (auto-retry on failure, 3 attempts with backoff)
  ↓
write round-N-editor.docx + .json
  ↓
status: "Round N — calling Reviewer (model)..."
  ↓
Reviewer pass (same retry behavior)
  ↓
write round-N-reviewer.json
  ↓
status: "✓ Round N complete"
  ↓
UI updates: Working translation shows new edit; Reviewer panel shows new suggestions
  ↓
[user clicks Continue → loop] or [user clicks Done → write final.docx, mark chapter done]
```

A model swap mid-loop changes the *next* call only; in-flight calls finish on the model that started them.

### Context boundaries

- **AIs see**: bilingual payload + system prompt + (Editor only, round N>1) prior Reviewer suggestions
- **AIs do not see**: chat history, prior round outputs, other chapters, book metadata
- Each round is independent. Token use is bounded; context drift is prevented.

## 6. Settings, Errors, Testing

### Settings page

**1. OpenRouter**

- API key — password field, masked. Stored in `~/.translate/config.json` (mode 600).
- "Test connection" button — hits `/models` endpoint, reports success/failure.
- Model list refresh — fetches and caches OpenRouter's model list locally. Auto-refresh on app start if cache > 24 hours; "Refresh now" button always available.

**2. Default models**

- Default Editor model dropdown (from cached OpenRouter list)
- Default Reviewer model dropdown
- Note: changing defaults does not affect existing books. Each book records its own model choices in `meta.json`.

**3. Prompts**

Two collapsible sub-sections (Editor, Reviewer). Each shows:

- Current version label (`v4`) and editable textarea
- "Save as new version" button — creates `v5`, sets it current, keeps `v4` in history
- "History" expandable list: every past version with timestamp + view/restore/delete actions
  - **View**: read-only modal
  - **Restore**: copies that version's text into a *new* entry; never deletes
  - **Delete**: removes a historical version (confirmation modal); cannot delete the current version

**4. Ingestion**

- Heading detection strategy for whole-book `.docx` splitting:
  - **Primary**: Word's "Heading 1" style
  - **Fallback patterns** (regex list, editable): `^Chapter\s+\d+`, `^Chapitre\s+\d+`, `^Capítulo\s+\d+`, `^Chapter\s+[IVXLCM]+`, etc. Pre-seeded.
  - Order: try primary; if it produces fewer than 2 chapters, try fallbacks in order until one produces 2+ chapters
- "Test split" — paste a path to a `.docx`; app shows the chapter list it would produce, without ingesting

### Error handling — three classes

| Class | Behavior | Surface |
|---|---|---|
| **Transient** (network blip, 5xx, rate limit) | Auto-retry with exponential backoff: 3 attempts at 1s, 2s, 4s | Status bar: `Round N — retry K/3...`. Surfaces only if all 3 fail. |
| **Recoverable** (bad model output: wrong paragraph count, malformed JSON) | No retry — surface immediately with a diagnostic | Status bar: `⚠ Editor returned 47 paragraphs, expected 52. [Retry pass] [Cancel round]` |
| **Configuration** (bad API key, model not available, missing source files) | Block the action, route user to the right settings panel | Modal: `OpenRouter rejected the API key. [Open settings]` |

**On retry exhaustion**: the chapter state stays at "round N-1 complete" — the failed round leaves no artifacts on disk. Clicking Continue retries the failed *pass*, not the whole round.

**On chapter-count mismatch during ingestion**: ingestion writes nothing, returns `English: 12 chapters | Translated: 11 chapters | <chapter list>`. User fixes the source folder and re-runs.

### Testing strategy

**Unit tests (server, fast):**

- `.docx` parser: round-trip a hand-crafted doc with paragraphs + italic + bold + headings; assert JSON shape and regenerated `.docx` match
- Chapter splitter: feed sample whole-book `.docx`s with various heading styles and patterns; assert correct chapter count and titles
- Bilingual payload renderer: feed two parsed-paragraph JSONs; assert exact wire format
- Editor output parser: feed sample model responses (correct, missing paragraphs, extra paragraphs, inline commentary); assert correct extraction or correct error
- Prompt versioning: save, view, restore, delete; assert history correctness
- Lock acquisition: clean lock acquired and released; stale lock (dead PID) taken over; live lock blocks startup with correct exit behavior

**Integration tests (server, mocked OpenRouter):**

- Full round: start with a bilingual chapter, run an Editor pass with a stubbed model, then a Reviewer pass with a stubbed model; assert files written, `meta.json` updated, state transitions correct
- Retry: stub model to fail twice then succeed; assert exactly 3 attempts and final success
- Retry exhaustion: stub model to always fail; assert 3 attempts, no files written, error surfaced
- Resume: ingest a book, run 2 rounds on chapter 1, restart the server, assert state loads correctly
- Second-launch handoff: start a server, attempt a second launch, assert second exits cleanly and the existing URL is what would have been opened

**End-to-end (manual, not automated):**

- Real OpenRouter call with a real test chapter (kept in `tests/fixtures/`). Run once before each release. Cheap (cents).
- Browser smoke test: launch the app, ingest a small book, do one round on chapter 1, finalize. Eyes-on, not scripted.

**No automated UI tests** — React components are simple enough that integration via the API surface gives sufficient coverage. Snapshot/visual tests would be high-noise for low value here.
