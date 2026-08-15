# Running a Whole Book at Once

A batch run does for every chapter what **Continue** does for one, unattended.

## Contents

- [Setting one up](#setting-one-up)
- [While it runs](#while-it-runs)
- [Two ways to stop](#two-ways-to-stop)
- [When a chapter fails](#when-a-chapter-fails)
- [How long, and how much](#how-long-and-how-much)

## Setting one up

Click **Batch run…** on the book screen:

| Setting | What it does |
|---|---|
| **From / To chapter** | The range to process. Defaults to the whole book |
| **Skip done chapters** | Leaves finalized chapters alone. Leave it ticked when resuming |
| **Editor / Reviewer** | Pre-filled from your saved defaults; change them here to override for this run only |
| **Rounds per chapter** | How many full Editor → Reviewer → Editor rounds each chapter gets |
| **Finalize each chapter when done** | Writes `final.docx` and marks each chapter done as it finishes |

Underneath, it tells you exactly what will happen: *"Will process 14 chapters (1–14) × 2 rounds each."* Read that line before clicking **Run**.

> [!NOTE]
> Every round always begins with a fresh Editor pass on the chapter's current text. A batch never picks up half-finished work from an earlier session, so what the log shows is what just ran.

## While it runs

The window shows the current chapter and round, a running total of **Completed** and **Errors**, and a live log. You can leave the tab open and watch, or leave it alone — but **don't close the Terminal window**, and don't close the browser tab if you want to keep watching (the run lives in the tab).

## Two ways to stop

- **Stop after current chapter** — finishes the chapter it's on, then stops. Tidiest.
- **Stop now** — abandons the pass in flight immediately. The chapter keeps its last completed round; nothing half-written is saved.

Either way you'll get a summary, and the run counts as stopped rather than failed.

## When a chapter fails

The batch **keeps going**. The failed chapter is counted under Errors and listed at the bottom with its reason; the next chapter starts.

That's deliberate — one provider hiccup at chapter 3 shouldn't cost you chapters 4 through 14. When the run ends, deal with the failures individually: open each chapter and click Continue, or fix the cause (sign in, pick another model) and run a second batch with **Skip done chapters** ticked.

## How long, and how much

Rough arithmetic: one pass is one to four minutes, a round is three passes, so a 14-chapter book at 2 rounds each is 84 passes — several hours. Start it and go do something else.

Cost depends entirely on the models: subscription CLIs add nothing, OpenRouter models bill per pass. Try **one chapter** first and multiply — see <a href="#" data-goto="help:costs">What This Costs You</a>.

## Related

<a href="#" data-goto="setup:choosing-models">→ Choosing Editor and Reviewer Models</a>

<a href="#" data-goto="help:troubleshooting">→ Troubleshooting</a>
