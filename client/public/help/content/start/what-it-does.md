# What Translate Does

You have a book that's been translated into another language, and the translation needs work. Translate walks each chapter past an AI **Editor** and an AI **Reviewer**, over and over, until it reads like a book instead of a translation — then hands you finished Word files.

It runs entirely on your own computer. Your manuscript is never uploaded anywhere except to the AI you choose, one chapter at a time.

## Contents

- [What you give it](#what-you-give-it)
- [What it does with them](#what-it-does-with-them)
- [What you get back](#what-you-get-back)
- [What it will not do](#what-it-will-not-do)

## What you give it

Two versions of the same book:

- the **original** (usually your English manuscript), and
- the **translation** you want improved (German, French, Spanish, whatever it is).

Both as `.docx` files — either one file per book or a folder of chapter files. Translate splits them into chapters and lines them up side by side, paragraph by paragraph, so the AI can always see what each translated sentence was *supposed* to say.

## What it does with them

One **round** is three passes over a chapter:

1. **Editor** — reads the original beside the translation and rewrites the translation so it reads naturally in the target language.
2. **Reviewer** — a *different* AI reads that new version against the original and writes up what's still wrong: stiff phrasing, wrong register, a joke that didn't land, a name spelled two ways.
3. **Editor again** — takes those notes and revises. This finishes the round.

Two different AIs is the whole point. One model editing its own work tends to bless it; a second model with fresh eyes argues with it. You can run as many rounds as a chapter needs.

## What you get back

A `final.docx` per chapter, in the target language, with your italics and bold preserved. Every round is kept on disk too, so you can always go back and compare.

## What it will not do

- It won't translate a book from scratch — it improves an existing translation.
- It won't touch your source files. Everything it produces is written to a separate working folder.
- It won't act on its own. Nothing runs until you click **Continue** or **Run batch**.

## Related

<a href="#" data-goto="start:first-run">→ Starting Translate the First Time</a>

<a href="#" data-goto="using:one-round">→ Running a Round on One Chapter</a>
