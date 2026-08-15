# Running a Round on One Chapter

## Contents

- [Do this first](#do-this-first)
- [What Continue does](#what-continue-does)
- [Watching it work](#watching-it-work)
- [How many rounds?](#how-many-rounds)
- [Stopping or recovering](#stopping-or-recovering)

## Do this first

Run **one chapter** before you turn Translate loose on a book. It takes a few minutes and tells you whether your model pairing suits your prose — much cheaper than finding out at chapter 14.

Open a book, click any chapter row, and check the **Editor** and **Reviewer** models in the toolbar.

## What Continue does

Click **Continue** and Translate runs three passes:

1. **Editor** rewrites the chapter, seeing the original beside the current translation.
2. **Reviewer** reads that new version against the original and writes up what's still wrong.
3. **Editor** revises using those notes.

All three are one **round**. Ask for one round and you get round 1 — the number in the interface counts rounds you asked for, not passes the machine made.

Each pass is saved as it completes, so a round that fails halfway never costs you the part that already worked.

## Watching it work

While a round runs you'll see:

- an **elapsed timer**, so you can tell the difference between "thinking" and "hung";
- the model's text **streaming in live** as it's written;
- an **activity log** of each step: `Ch 3 R1 → Editor (claude-code/default) · source: original translation`, then `← Editor returned`, and so on.

A normal chapter takes roughly one to four minutes per pass, depending on the model and the chapter's length. A "thinking" model is slower and usually better.

If a pass fails for a temporary reason — a network blip, a busy provider — Translate retries it up to three times, and you'll see `retry 2/3…` in the log. Problems that retrying can't fix (not signed in, a model your tool can't run) stop immediately with a message telling you what to do.

## How many rounds?

Most chapters improve noticeably on round 1, meaningfully on round 2, and marginally after that. Two to three is typical. Read the result and decide — the Reviewer's suggestion count is a useful hint: when it drops from 40 to a handful of nitpicks, you're close to done.

Clicking **Continue** again starts the next round from the text the last one produced.

## Stopping or recovering

Just don't click Continue again. Nothing runs on its own.

If a round dies partway (you closed the Terminal, the provider fell over), no harm is done: the chapter stays at its last completed round and the next Continue starts a fresh round from that text.

## Related

<a href="#" data-goto="using:reading-panes">→ Reading the Three Panes and the Diff</a>

<a href="#" data-goto="using:finishing">→ Finishing a Chapter</a>
