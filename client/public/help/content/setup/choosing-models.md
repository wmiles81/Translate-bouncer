# Choosing Editor and Reviewer Models

Every round uses two models: one **Editor** that rewrites, one **Reviewer** that criticises. Picking them is the single biggest lever you have over the quality of the result.

## Contents

- [How the picker works](#how-the-picker-works)
- [Reading the table](#reading-the-table)
- [Filtering and sorting](#filtering-and-sorting)
- [Defaults vs per-run choices](#defaults-vs-per-run-choices)
- [Picking well](#picking-well)

## How the picker works

Two controls side by side:

1. **The provider** — which route the model comes through: one of your signed-in CLIs, or OpenRouter.
2. **The model** — click it and a table drops down listing what that provider offers.

Click a row to choose it. In **Settings** your choice saves immediately — there's no Save button to hunt for.

## Reading the table

| Column | What it tells you |
|---|---|
| **Model** | The model's name. **Red** names are "thinking" models — they reason before answering: slower, often better on hard passages |
| **Writing** | Creative-writing score from the EQ-Bench benchmark. Higher is better prose; **—** means unscored, not bad |
| **Context** | How much text it can hold at once. Any of these handles a normal chapter |
| **$ In / Out** | Cost per million tokens in and out. **$0 / $0** means a subscription CLI — covered by what you already pay |

Select a row and its description appears underneath, straight from the provider.

## Filtering and sorting

**Tier** narrows the list: *Free*, *Cheap (<$1/M)*, *Medium (<$5/M)*, *Has writing score*, *Good writers (≥1300)*, *Great writers (≥1500)*.

**Sort** reorders by Provider, Writing, Context or Price. Clicking a column header sorts by that column and clicking again reverses it.

For fiction, **Tier: Good writers (≥1300)** sorted by **Writing** is the shortlist worth reading.

## Defaults vs per-run choices

- **Settings → Default models** is what every new chapter and batch starts with.
- The **Editor / Reviewer** pickers in the chapter toolbar, and inside the Batch run window, override the default **for that work only**. Your saved defaults don't change.

So set a sensible default pair once, and override when you want to try something on a single chapter.

## Picking well

- **Use two different models.** A model reviewing its own work mostly agrees with itself. Different vendors disagree more usefully than two models from the same family.
- **Spend on the Editor.** It writes the prose you'll keep. The Reviewer only writes notes, so a cheaper model is fine there.
- **Try one chapter before a whole book.** Run a chapter, read the result, and change the pairing if the voice is off — much cheaper than discovering it 14 chapters in.
- **Watch for a "using the agent's default model" note** in the activity log. It means the model you picked wasn't available and something else did the work.

## Related

<a href="#" data-goto="using:one-round">→ Running a Round on One Chapter</a>

<a href="#" data-goto="help:costs">→ What This Costs You</a>
