# Changing the Editor and Reviewer Instructions

The instructions each AI receives are yours to edit. This is the most powerful setting in Translate and the easiest one to break, so it's worth understanding before you change it.

## Contents

- [Where they are](#where-they-are)
- [What each prompt does](#what-each-prompt-does)
- [The placeholders](#the-placeholders)
- [Versions and restoring](#versions-and-restoring)
- [Editing well](#editing-well)

## Where they are

**Settings → Prompts.** Two editors, one for the Editor pass and one for the Reviewer pass, each showing the instructions currently in use.

Change the text and click **Save as new version**. The next round uses it.

## What each prompt does

**The Editor prompt** tells the rewriting AI what "good" means for your book — how close to stay to the original, how much to smooth, what to leave alone. Its output *is* your prose, so changes here show up directly in the manuscript.

**The Reviewer prompt** tells the critiquing AI what to look for and how to report it. Its output is a list of notes, so changes here shift what gets flagged — and therefore what the Editor is nudged to change.

## The placeholders

Both prompts can contain two tokens, filled in per book:

| Token | Becomes |
|---|---|
| `{TARGET_LANG_NAME}` | the language's name, e.g. *German* |
| `{TARGET_LANG_CODE}` | its short code in caps, e.g. *DE* |

**Keep them.** They're how one prompt serves every language pair. Deleting them leaves the AI guessing which language to write in.

The Reviewer prompt also asks for its answer as a JSON list of `quote`/`comment` pairs — that's what fills the Suggestions pane. If you rewrite it into free prose, the pane will have nothing to show.

## Versions and restoring

Nothing is overwritten. **Save as new version** adds a version and makes it current; **Show history** lists them all, and **Restore** puts an older one back in use.

Each chapter records which prompt version produced it, so a chapter edited last week is traceable to the wording in force at the time.

That makes experimentation safe: change the wording, run one chapter, compare, and restore the old version if the result is worse.

## Editing well

- **Change one thing at a time**, then run the same chapter and compare. Two changes at once and you won't know which helped.
- **Add, don't rewrite.** Appending a rule ("Preserve the narrator's dry, understated tone"; "Never change character names or invented terms") is safer than starting over.
- **Be concrete.** "Better prose" does nothing; "Prefer active voice; avoid stacking more than two adjectives" does.
- **Use it to protect deliberate choices** — dialect, a character's broken grammar, deliberate repetition. Telling the Reviewer to leave those alone stops rounds from sanding them off.
- If the Editor starts returning odd output, restore the previous version before running more chapters.

## Related

<a href="#" data-goto="using:suggestions">→ Reviewer Suggestions and the Dialog View</a>

<a href="#" data-goto="help:troubleshooting">→ Troubleshooting</a>
