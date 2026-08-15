# Skills and Workflows Used on This Repo

Translate is developed with Claude Code plus the **superpowers** skill set. This page records which workflows are actually used here, what artifacts they leave behind, and where to pick up an interrupted one.

## Contents

- [The repair workflow that built this branch](#the-repair-workflow-that-built-this-branch)
- [Artifacts you will find](#artifacts-you-will-find)
- [Skills worth reaching for](#skills-worth-reaching-for)
- [Agents](#agents)
- [Resuming an interrupted plan](#resuming-an-interrupted-plan)

## The repair workflow that built this branch

Branch `acp-repair` was produced by this chain:

1. **`/code-review`** over the ACP commit → 10 confirmed findings, written to `docs/reviews/2026-08-13-code-review.md`.
2. **A spec** distilling the findings into requirements R1–R12 → `docs/specs/2026-08-13-acp-repair-spec.md`.
3. **`superpowers:writing-plans`** → a 14-task TDD plan at `docs/superpowers/plans/2026-08-13-acp-repair.md`, each task carrying its failing test, its implementation, its run commands, and its commit message.
4. **`superpowers:subagent-driven-development`** → one fresh implementer subagent per task, then a task reviewer (spec compliance + quality), with a fix loop when a review found something. Progress was tracked in a ledger at `.superpowers/sdd/2026-08-13-acp-repair/progress.md`.
5. **`superpowers:systematic-debugging`** for each live failure found afterwards (the "Connection closed" stream limit, the Codex "Internal error") — root cause before fix, always.

That plan is complete. Later work (OpenRouter restoration, the model picker, Stop now, book removal, round semantics) was done directly, each change with tests and a live check.

## Artifacts you will find

| Path | What it is | Keep? |
|------|------------|-------|
| `docs/reviews/*.md` | Review reports | yes — history |
| `docs/specs/*.md` | Requirement specs | yes |
| `docs/superpowers/plans/*.md` | Task-by-task implementation plans | yes |
| `.superpowers/sdd/<plan>/` | Ledger, task briefs, per-task reports and diffs | git-ignored scratch; delete when the plan is finished and merged |
| `.playwright-mcp/` | Browser snapshots/screenshots from live verification | scratch |
| `.omc/`, `client/.omc/` | Tooling state | scratch |

## Skills worth reaching for

- **`superpowers:systematic-debugging`** — mandatory for any bug. Root cause first; no fix before Phase 1 is done. It is what turned "Connection closed on every Claude round" into "asyncio's 64 KiB line limit" instead of a guess.
- **`superpowers:test-driven-development`** — the repo's tests are structured this way: a failing test that names the real failure mode, then the fix.
- **`superpowers:writing-plans`** / **`subagent-driven-development`** — for multi-step work; the plan format above is the house style.
- **`superpowers:verification-before-completion`** — run it before claiming anything works.
- **`/code-review`** — diff review at a chosen effort level.
- **`help-system`** — generated this help; **`help-maintainer`** keeps it in sync (see Keeping This Help Current).

Fiction-side skills (`translation-proofreader`, `prose-editor`, `continuity-checker`, …) are about *manuscripts*, not this codebase. They're relevant when evaluating Translate's **output quality**, not its code.

## Agents

Useful subagent types for this repo:

- `Explore` — broad read-only sweeps when you don't know where something lives.
- `feature-dev:code-reviewer`, `oh-my-claudecode:code-reviewer` — targeted review passes.
- `oh-my-claudecode:debugger` / `tracer` — root-cause work with competing hypotheses.
- `help-maintainer` — syncs this help with shipped changes.

When dispatching against a manuscript file, **pass its annotation sidecar** (or instruct the agent to read it) — see House Rules.

## Resuming an interrupted plan

The ledger is the recovery map. Read `.superpowers/sdd/<plan>/progress.md`: tasks with a `complete` line are done — do not re-dispatch them. A trailing `fix round` line means that task is mid-loop. Trust the ledger and `git log` over recollection.

## Related

<a href="#" data-goto="agents:maintaining-help">→ Keeping This Help Current</a>

<a href="#" data-goto="agents:conventions">→ House Rules</a>
