# Finishing a Chapter and Getting Your Word File

## Contents

- [Clicking Done](#clicking-done)
- [Where the file lands](#where-the-file-lands)
- [What it contains](#what-it-contains)
- [Changing your mind](#changing-your-mind)
- [Assembling the book](#assembling-the-book)

## Clicking Done

When a chapter reads the way you want, click **Done**. Translate:

1. writes **`final.docx`** for that chapter, taking the newest text — the post-review version of the last round;
2. marks the chapter **done** (green) on the book screen;
3. lets batch runs with **Skip done chapters** pass over it.

**Done** is enabled once at least one round has run.

## Where the file lands

```
~/.translate/<your-book>/chapters/ch07/final.docx
```

On Windows that's `%USERPROFILE%\.translate\…`. The chapter number is padded — chapter 7 is `ch07`.

The quickest route there: **Settings** shows the folder Translate is using, or open your home folder and look for `.translate` (it starts with a dot, so on a Mac press **⌘⇧.** in Finder to reveal hidden items).

## What it contains

The finished chapter in the target language, with italics and bold intact. It's a normal `.docx` — open it in Word, Scrivener, Vellum, anything.

Every earlier version is kept beside it (`round-1-editor.docx`, `round-2-editor-revised.docx`, and so on), so you can always compare against a previous round or recover text you preferred.

## Changing your mind

Clicking **Continue** after finalizing runs another round and gives you a newer version; click **Done** again to overwrite `final.docx` with it.

To roll the whole book back to the imported translation, see <a href="#" data-goto="manage:remove-restore">Removing a Book or Starting It Over</a>.

## Assembling the book

Translate works chapter by chapter and doesn't stitch the book back together — that's deliberate, since every author's assembly step differs (Vellum, Scrivener, a Word master document).

Combine the `final.docx` files in chapter order in whatever tool you already use for layout. They're in numbered folders, so sorting is trivial.

## Related

<a href="#" data-goto="manage:files">→ Where Your Files Are Saved</a>

<a href="#" data-goto="using:batch">→ Running a Whole Book at Once</a>
