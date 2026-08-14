# What This Costs You

## Contents

- [Translate itself](#translate-itself)
- [Subscription CLIs: no extra cost](#subscription-clis-no-extra-cost)
- [OpenRouter: pay per pass](#openrouter-pay-per-pass)
- [Working out a book](#working-out-a-book)
- [Keeping it down](#keeping-it-down)

## Translate itself

Free. It runs on your computer and charges nothing. The only costs are whatever the AI you point it at charges.

## Subscription CLIs: no extra cost

Rounds run through Claude Code, Codex, Gemini CLI or Qwen are covered by the subscription you already pay for. Those models show **$0 / $0** in the picker, and a whole book adds nothing to your bill.

The limit is usage, not money: each subscription has its own caps, and a long batch can hit them. Codex has a daily cap in particular — when you reach it, rounds fail until it resets. Claude Max and Gemini AI Pro are more generous.

> [!NOTE]
> These are consumer subscriptions being driven programmatically. Keep batches reasonable and expect the provider's limits to apply as they see fit.

## OpenRouter: pay per pass

OpenRouter bills per token. The picker shows each model's price **per million tokens**, input and output.

A rough guide for one pass on a typical 3,000-word chapter: the AI reads the English plus the current translation and writes a full new translation — on the order of 15–25,000 tokens in and 5–10,000 out. So:

| Model price (out) | Rough cost per pass |
|---|---|
| $0.50 / M | under a cent |
| $2.50 / M | a few cents |
| $15 / M | 10–20 cents |

**A round is three passes.** Multiply by rounds, then by chapters.

## Working out a book

Do this instead of estimating: run **one chapter, one round**, then look at your OpenRouter usage page. Multiply that figure by chapters × rounds. You'll have a real number in five minutes.

For a 14-chapter book at 2 rounds each, that's 84 passes — cheap on a budget model, meaningful on a premium one.

## Keeping it down

- **Editor on a subscription CLI, Reviewer on OpenRouter.** The Editor does the heavy writing; a cheap reviewer still gives you the second-opinion benefit.
- **Use the Tier filter.** *Cheap (<$1/M)* still contains capable models; sort by **Writing** within it.
- **Fewer rounds.** Most gain arrives in rounds 1–2.
- **Trial on one chapter** before committing a book to an expensive model.
- **Watch the suggestion count.** When the Reviewer is down to nitpicks, more rounds are spending money for little return.

## Related

<a href="#" data-goto="setup:choosing-models">→ Choosing Editor and Reviewer Models</a>

<a href="#" data-goto="using:batch">→ Running a Whole Book at Once</a>
