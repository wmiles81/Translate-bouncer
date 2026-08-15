# Adding a Book

## Contents

- [What you need](#what-you-need)
- [Adding it](#adding-it)
- [How chapters are found](#how-chapters-are-found)
- ["Chapter count mismatch"](#chapter-count-mismatch)
- [Adding the same book twice](#adding-the-same-book-twice)

## What you need

Two `.docx` files (or two folders of `.docx` files, one per chapter):

- the **original** manuscript, and
- the **translation** to be improved.

They must contain the **same chapters in the same order**. Translate pairs them up chapter by chapter, then paragraph by paragraph — that pairing is what lets the Editor see what each sentence was meant to say.

## Adding it

1. On the Books screen, click **+ New book**.
2. Pick the **translated** file or folder, then the **English** (original) one. The **Browse…** buttons open a normal file picker; you can also paste a path.
3. Choose the **language pair** — what it's translated *from* and *to*. This is how the AI knows which language to write in, so get it right.
4. Click **Create book**.

Translate reads both documents, splits them into chapters, saves its own copies, and drops you on the chapter list. Your original files are never modified.

## How chapters are found

Translate first looks for paragraphs styled as a **heading** — by default Word's *Heading 1*. That's the reliable way, and if your manuscript uses heading styles you don't need to do anything.

If it finds no headings, it falls back to matching chapter-opening text, out of the box:

```
^Chapter\s+\d+          Chapter 1, Chapter 12
^Chapitre\s+\d+         French
^Capítulo\s+\d+         Spanish
^Chapter\s+[IVXLCM]+    Chapter IV
```

Both the heading style and these patterns are editable in **Settings → Ingestion**. If your book marks chapters some other way (`KAPITEL 3`, `— 7 —`), add a pattern there before importing.

## "Chapter count mismatch"

This is the most common import failure, and it means exactly what it says: Translate found a different number of chapters in the two documents — for example 14 in the English and 15 in the German. It refuses rather than pairing chapter 5 with chapter 6 for the rest of the book.

The error lists the chapter titles it found on each side. Compare the two lists and look for:

- a front-matter page (copyright, dedication, "About the author") styled as a heading in one file but not the other;
- a chapter split in two, or two merged, by the translator;
- headings in one file that aren't real headings — a scene break styled *Heading 1* by accident.

Fix the `.docx` (or adjust the patterns in Settings) and import again.

## Adding the same book twice

Importing a book whose name already exists creates a **separate** book with `-2` appended rather than overwriting. Your earlier work stays untouched. To genuinely start over on the same book, see <a href="#" data-goto="manage:remove-restore">Removing a Book or Starting It Over</a>.

## Related

<a href="#" data-goto="using:one-round">→ Running a Round on One Chapter</a>

<a href="#" data-goto="manage:files">→ Where Your Files Are Saved</a>
