# ModelPicker: Provider Selector + Model Table

`client/src/components/ModelPicker.tsx` is the single control for choosing a model. It appears in the TopBar (Editor and Reviewer), in Settings (defaults), and in the batch modal — same component, same props, everywhere.

## Contents

- [Shape](#shape)
- [Route filtering](#route-filtering)
- [The table](#the-table)
- [Writing scores](#writing-scores)
- [Data flow and refresh](#data-flow-and-refresh)
- [Settings auto-save](#settings-auto-save)

## Shape

Two controls side by side:

1. **Provider `<select>`** — the four CLIs (each marked detected ●/not found ○, undetected ones `disabled`) plus **OpenRouter** (disabled with a hint when no API key is set).
2. **Model dropdown trigger** — opens an anchored panel modelled on the ModelRouter desktop app (`openrouter-show/openrouter_tk.py`): Tier filter, Sort dropdown, sortable four-column table, description strip.

```tsx
<ModelPicker label="Editor" value={editorModel} models={models} onChange={setEditorModel} />
```

The panel flips to `left-0` when it would overflow the viewport (`alignLeft`), closes on outside click and Escape, and picks a model on a **single row click**.

## Route filtering

Rows are separated by provenance, not by id shape:

```ts
const isCliRow = (r) => r.isCli;          // from the server's source: "cli"
prov === OPENROUTER ? !isCliRow(r) : isCliRow(r) && r.provider === prov
```

So OpenRouter's `qwen/qwen3-max` stays under OpenRouter even though `qwen` names a CLI, and `codex/gpt-5.5` appears under Codex. The provider select also follows the current value: set a `deepseek/...` model and it switches to OpenRouter by itself.

## The table

`client/src/lib/modelTable.ts` holds the shared logic so the component stays presentational:

- **Tiers** (cumulative price bands): All, Free, Cheap (<$1/M), Medium (<$5/M), Has writing score, Good writers (≥1300), Great writers (≥1500).
- **Sorts**: Provider, Writing, Context, Price — each tie-breaking by provider then id.
- **Columns**: Model | Writing | Context | $ In / Out. Clicking a header sorts by it and toggles direction, overriding the Sort dropdown until that dropdown changes again.
- **Formats** mirror the reference app: `128k` context, `$0.15`-style per-million prices with trailing zeros trimmed, `—` for missing values.
- **Thinking models render in `#c0152f`** (red), detected via `reasoning` / `include_reasoning` in `supported_parameters`.

## Writing scores

`client/src/data/eqbench_scores.json` bundles 102 EQ-Bench creative-writing Elo scores, joined by OpenRouter slug (falling back to the id with any `:free`-style suffix stripped). For translation editing this is the most useful column in the table.

To refresh it, regenerate with the reference app's `update_eqbench.py` and drop the new file in place — no code change.

## Data flow and refresh

`useModels()` and `useProviders()` both wrap `useFetch<T>`, which:

- fetches on mount,
- exposes a memoized `refresh()`,
- and **refetches when the tab regains focus** (`focus` + `visibilitychange`).

That last part exists because a long-open tab otherwise keeps the catalog it loaded at mount — after a server restart added Codex models, a stale tab showed "414 models" while the server served 421, which reads as a missing feature.

## Settings auto-save

In `SettingsRoute`, selections persist immediately — no Save click:

- picking a model calls `saveAll({ editor })` / `saveAll({ reviewer })`;
- the OpenRouter key saves **on blur** and then refreshes the model list.

`saveAll(overrides)` exists because React state hasn't updated yet inside a change handler, so the just-picked value is passed explicitly. The Save button remains for the ingestion fields.
