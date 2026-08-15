# Keeping This Help Current

Help content six months out of sync with the codebase is worse than no help — a confident wrong answer costs more than an absent one.

## Contents

- [How to edit](#how-to-edit)
- [Rebuild and view](#rebuild-and-view)
- [When to update](#when-to-update)
- [What a good topic looks like](#what-a-good-topic-looks-like)
- [Context links](#context-links)

## How to edit

```
help/
  manifest.json        categories, pages, defaultTopic, contextMap
  content/<category>/<page>.md
  build_help.py        compiles content/ → assets/content.js
  assets/              shell: index.html loader, app.js, style.css, content.js
  serve_help.py        local server for headless/editor environments
  credits.md           attribution (rendered as About → Credits)
```

Edit markdown in `content/`; add a page by creating the file **and** registering it in `manifest.json`. Categories are ad-hoc — a directory exists because the manifest references it.

Supported markdown: headings, `**bold**`, `*italic*`, `` `code` ``, fenced blocks with language tags, lists, tables, blockquotes, plus `> [!NOTE]` and `> [!WARNING]` callouts.

**Cross-links must use the data-goto form**, not markdown links, or the shell rebuilds its search tree and loses state:

```html
<a href="#" data-goto="providers:errors">Error Taxonomy</a>
```

## Rebuild and view

```bash
python3 help/build_help.py          # writes help/assets/content.js
open help/index.html                # or: python3 help/serve_help.py
```

`index.html` works over `file://`. Over SSH or in a container use `serve_help.py`. Deep links work by hash: `help/index.html#p=providers%3Aerrors`.

## When to update

Run the `help-maintainer` agent, or edit by hand, whenever:

- a **provider quirk changes** — a new adapter release, a CLI that starts or stops exposing models, a new auth requirement;
- **round semantics or on-disk layout** change (any new `round-*` filename, any new `RoundEntry` field);
- **routes change** — new endpoint, new request field, different error shape;
- a **known issue** in Known Issues is fixed — delete it, don't leave a fixed bug documented as live;
- the **packaging flow** changes.

Each topic here cites real symbols (`_launch_plan`, `needsLeadingEditor`, `STREAM_LIMIT`) and real paths. If you rename one, grep `help/content/` for it.

## What a good topic looks like

- Named after what someone would search for ("Error Taxonomy: What Retries and What Doesn't"), not "Introduction".
- Cites actual functions, files, constants, and error strings from this codebase.
- Says **why**, not just what — the reason `_initialize()` bypasses the typed SDK call is the whole point of that paragraph.
- Marks live problems with a warning callout and dates them.
- Would still be true in six months, or is explicitly dated so a reader knows to re-verify.

## Context links

`manifest.json` maps host-app contexts to topics:

```json
"contextMap": {
  "settings-view": "frontend:model-picker",
  "batch-run": "frontend:batch-runner",
  "chapter-view": "concepts:rounds",
  "provider-error": "providers:errors"
}
```

Opening help with `?ctx=provider-error` jumps straight to the error taxonomy. If the app ever grows an in-UI Help button, pass the current view's key that way. This help is currently developer-facing and opened directly from the repo — it is not wired into the Translate SPA, and the end-user manual remains `README_v2.md` / `QUICK_START.txt`.

## Related

<a href="#" data-goto="quirks:known-issues">→ Known Issues</a>
