# Where Your Files Are Saved

Everything Translate creates lives in one folder in your home directory. Your original manuscripts are never touched.

## Contents

- [The folder](#the-folder)
- [What's in a chapter folder](#whats-in-a-chapter-folder)
- [Backing up](#backing-up)
- [Your API key](#your-api-key)

## The folder

- **Mac / Linux:** `~/.translate/`
- **Windows:** `%USERPROFILE%\.translate\`

It starts with a dot, so it's hidden by default. In Finder press **⌘⇧.** to show hidden items; in File Explorer tick **Hidden items** under the View tab.

```
~/.translate/
  config.json                    your settings and API key
  the-load-bearing-wife-en-de/   one folder per book
    source-en/                   Translate's copy of your original
    source-translated/           Translate's copy of the translation
    chapters/
      ch01/ … ch14/
```

The book folder is named from your file, lower-cased with dashes.

## What's in a chapter folder

```
chapters/ch07/
  round-1-editor.docx            first Editor pass
  round-1-reviewer.json          what the Reviewer said
  round-1-editor-revised.docx    after applying those notes — end of round 1
  round-2-editor.docx            round 2 begins…
  final.docx                     written when you click Done
  archive-1/                     earlier work, kept by "Restore original"
```

Two things worth knowing:

- **Nothing is overwritten.** Each pass writes new files, so every version of every chapter stays recoverable.
- **`.raw.txt` files** sit beside the `.docx` ones. They're the model's unedited reply, kept for diagnosis when a pass produces something odd.

## Backing up

Copy the whole `~/.translate/` folder. That's the lot — books, every round, your settings.

Worth doing before a long batch run, and it's also how you move your work to another machine: install Translate there and drop the folder in place.

## Your API key

`config.json` holds your OpenRouter key if you set one, along with your default models and ingestion settings. It's written so only your user account can read it.

If you back the folder up somewhere shared, remember that file contains a live key.

## Related

<a href="#" data-goto="manage:remove-restore">→ Removing a Book or Starting It Over</a>

<a href="#" data-goto="using:finishing">→ Finishing a Chapter</a>
