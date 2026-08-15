# Removing a Book or Starting It Over

Two buttons on each row of the Books screen. **Neither deletes anything.**

## Contents

- [Remove](#remove)
- [Restore original](#restore-original)
- [Which one you want](#which-one-you-want)
- [Getting a removed book back](#getting-a-removed-book-back)

## Remove

Takes the book off the list and leaves every file exactly where it is.

Use it for clutter: a test import, a duplicate, a book you finished months ago. Your rounds, your `final.docx` files and your sources all stay in `~/.translate/<book>/`.

The confirmation says so plainly, and afterwards the book simply isn't listed.

## Restore original

Rewinds the **editing**, keeping the book.

Every chapter goes back to round 0 and untouched, working from the translation you imported. Existing rounds and finals are **moved**, not deleted, into an archive folder inside each chapter:

```
chapters/ch07/archive-1/    everything from before the restore
```

Restore a second time later and you get `archive-2`, with `archive-1` untouched. Lower numbers are older. The imported sources were never modified, so "the original translation" is always genuinely available.

Use it when you want a clean run: you've changed models, rewritten the prompts, or the first attempt went sideways and you'd rather start fresh than layer more rounds on top.

> [!NOTE]
> After a restore, the next round starts with a fresh Editor pass on the original translation — exactly as if the book had just been imported.

## Which one you want

| You want to… | Use |
|---|---|
| tidy the list, keep the work | **Remove** |
| re-edit this book from scratch | **Restore original** |
| genuinely delete files | neither — delete the folder in Finder/Explorer yourself |

## Getting a removed book back

Removal sets a flag in the book's `meta.json`. To bring it back, open

```
~/.translate/<book>/meta.json
```

in any text editor and change `"hidden": true` to `"hidden": false`. Refresh the Books screen and it reappears with all its work.

Archived rounds can be recovered the same way — move files back out of `archive-1/` into the chapter folder.

## Related

<a href="#" data-goto="manage:files">→ Where Your Files Are Saved</a>

<a href="#" data-goto="start:add-a-book">→ Adding a Book</a>
