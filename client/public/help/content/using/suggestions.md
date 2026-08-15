# Reviewer Suggestions and the Dialog View

## Contents

- [What a suggestion is](#what-a-suggestion-is)
- [Suggestions vs Dialog](#suggestions-vs-dialog)
- [Reading the dialog](#reading-the-dialog)
- [When suggestions look wrong](#when-suggestions-look-wrong)

## What a suggestion is

Each entry has a **quote** — the exact span the Reviewer objected to — and a **comment** explaining the problem. Typical fare on a translated novel:

> **"sind ich und die Plotter"** — unidiomatic; a German speaker would say "bin ich und die Plotter" or restructure the sentence.

> **"#  Kapitel 1"** — double space after the heading marker; make it match the English formatting.

The Reviewer sees both the original and the current translation, so it can catch meaning drift, not just awkward phrasing.

## Suggestions vs Dialog

Two buttons at the top of the right-hand pane:

- **Suggestions** — the latest round's notes, formatted and readable. This is the everyday view.
- **Dialog** — the raw exchange for every round: exactly what the Editor sent back and exactly what the Reviewer replied, round by round.

## Reading the dialog

Use **Dialog** when a chapter went somewhere strange and you want to know why. It shows, per round, which model played each role and what each actually said — including the Reviewer's unformatted reply.

It's the place to look when a chapter's prose changed in a way you didn't expect: you can usually see the suggestion that caused it.

## When suggestions look wrong

The Reviewer is a second opinion, not an authority. It sometimes objects to deliberate choices — dialect, a character's broken grammar, a stylistic repetition — and the Editor is told to apply only the ones it agrees with, so those are often quietly ignored anyway.

If a Reviewer keeps pushing the prose in a direction you don't want:

- **Change the Reviewer model.** Voice varies a lot between models.
- **Edit the reviewer instructions** to tell it what to leave alone — see <a href="#" data-goto="manage:prompts">Changing the Editor and Reviewer Instructions</a>. Adding a line like *"Do not flag intentional dialect or a character's non-standard grammar"* works well.
- **Stop running rounds.** If suggestions are down to taste quibbles, the chapter is done.

## Related

<a href="#" data-goto="manage:prompts">→ Changing the Editor and Reviewer Instructions</a>

<a href="#" data-goto="using:reading-panes">→ Reading the Three Panes and the Diff</a>
