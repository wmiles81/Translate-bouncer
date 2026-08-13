import { useMemo, useState } from "react";
import eqbenchData from "../data/eqbench_scores.json";
import { useModels } from "../hooks/useModels";
import type { Model } from "../types/api";

// Mirrors the ModelRouter desktop app (openrouter-show/openrouter_tk.py):
// a Tier filter + Sort dropdown control bar, a sortable four-column table
// (Model | Writing | Context | $ In / Out) with thinking models in red, and a
// description pane under the table. Single-click selects a row and shows its
// description; double-click picks the model.

const BG = "#f4f4f7";
const THINKING_FG = "#c0152f";

const EQBENCH: Record<string, { elo?: number; rubric?: number }> =
  (eqbenchData as { scores?: Record<string, { elo?: number; rubric?: number }> }).scores ?? {};

interface Row {
  id: string;
  name: string;
  description: string;
  provider: string;
  context: number;
  priceIn: number; // $/million tokens
  priceOut: number; // $/million tokens
  isThinking: boolean;
  writingElo: number | null;
}

function toRow(m: Model): Row {
  const priceIn = (parseFloat(m.pricing?.prompt ?? "0") || 0) * 1_000_000;
  const priceOut = (parseFloat(m.pricing?.completion ?? "0") || 0) * 1_000_000;
  const params = m.supported_parameters ?? [];
  const score = EQBENCH[m.id] ?? EQBENCH[m.id.split(":")[0]];
  return {
    id: m.id,
    name: m.name ?? m.id,
    description: (m.description ?? "").trim(),
    provider: m.id.split("/")[0] || m.id,
    context: m.context_length ?? 0,
    priceIn,
    priceOut,
    isThinking: params.includes("reasoning") || params.includes("include_reasoning"),
    writingElo: score?.elo ?? null,
  };
}

// Context length -> compact 'k' string, e.g. 128000 -> '128k'.
function formatContext(ctx: number): string {
  if (!ctx) return "—";
  return ctx >= 1000 ? `${Math.floor(ctx / 1000)}k` : String(ctx);
}

// $/million-tokens -> short string. Keeps small prices readable.
function formatPrice(value: number): string {
  if (value === 0) return "$0";
  if (value < 1) return `$${value.toFixed(3)}`.replace(/0+$/, "").replace(/\.$/, "");
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// EQ-Bench Elo as an integer string, or '—' when unscored.
function formatWriting(row: Row): string {
  return row.writingElo ? String(Math.round(row.writingElo)) : "—";
}

// Keyed by the exact label shown in the dropdown, so the option values and the
// logic that backs them can never drift apart. Price tiers are CUMULATIVE.
const TIERS: Record<string, (r: Row) => boolean> = {
  "All": () => true,
  "Free": (r) => r.priceIn === 0 && r.priceOut === 0,
  "Cheap (<$1/M)": (r) => r.priceOut < 1.0,
  "Medium (<$5/M)": (r) => r.priceOut < 5.0,
  "Has writing score": (r) => r.writingElo !== null,
  "Good writers (≥1300)": (r) => (r.writingElo ?? 0) >= 1300,
  "Great writers (≥1500)": (r) => (r.writingElo ?? 0) >= 1500,
};

type SortTuple = (r: Row) => (string | number)[];
const SORT_ORDERS: Record<string, SortTuple> = {
  "Provider": (r) => [r.provider, r.id],
  "Writing (high→low)": (r) => [-(r.writingElo ?? -Infinity), r.provider, r.id],
  "Context (high→low)": (r) => [-r.context, r.provider, r.id],
  "Price (low→high)": (r) => [r.priceOut, r.provider, r.id],
};

// Treeview columns: id -> (heading, alignment, sort key) as in the reference.
const COLUMNS: { key: ColKey; heading: string; align: string; sort: (r: Row) => string | number }[] = [
  { key: "model", heading: "Model", align: "text-left", sort: (r) => r.id },
  { key: "writing", heading: "Writing", align: "text-center", sort: (r) => r.writingElo ?? -Infinity },
  { key: "context", heading: "Context", align: "text-center", sort: (r) => r.context },
  { key: "price", heading: "$ In / Out", align: "text-right", sort: (r) => r.priceOut },
];
type ColKey = "model" | "writing" | "context" | "price";

function compareTuples(a: (string | number)[], b: (string | number)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

interface Props {
  initialValue: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
}

export default function ModelBrowser({ initialValue, onSelect, onCancel }: Props) {
  const { models, loading, error, refresh } = useModels();
  const [tier, setTier] = useState<string>("All");
  const [sortLabel, setSortLabel] = useState<string>("Provider");
  // Header-click sort overrides the dropdown until the dropdown changes again.
  const [colSort, setColSort] = useState<{ col: ColKey; asc: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string>(initialValue);

  const rows = useMemo(() => models.map(toRow), [models]);

  const shown = useMemo(() => {
    const keep = TIERS[tier] ?? TIERS["All"];
    let out = rows.filter(keep);
    if (colSort) {
      const col = COLUMNS.find((c) => c.key === colSort.col)!;
      out = out.slice().sort((a, b) => {
        const x = col.sort(a), y = col.sort(b);
        const cmp = typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x) < String(y) ? -1 : x === y ? 0 : 1;
        return colSort.asc ? cmp : -cmp;
      });
    } else {
      const key = SORT_ORDERS[sortLabel] ?? SORT_ORDERS["Provider"];
      out = out.slice().sort((a, b) => compareTuples(key(a), key(b)));
    }
    return out;
  }, [rows, tier, sortLabel, colSort]);

  const selected = shown.find((r) => r.id === selectedId) ?? rows.find((r) => r.id === selectedId);

  const headerClick = (col: ColKey) => {
    setColSort((prev) => ({ col, asc: prev?.col === col ? !prev.asc : true }));
  };

  const status = loading
    ? "Loading…"
    : error
      ? error.message
      : `${shown.length} of ${rows.length} models · double-click to select`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded shadow-lg"
        style={{ backgroundColor: BG }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <h2 className="text-lg font-semibold">Browse models</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </header>

        <div className="flex items-center gap-1 px-4 pb-2 pt-3.5">
          <span className="text-sm">Tier:</span>
          <select
            aria-label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="mr-3 ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {Object.keys(TIERS).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <span className="text-sm">Sort:</span>
          <select
            aria-label="Sort"
            value={sortLabel}
            onChange={(e) => { setSortLabel(e.target.value); setColSort(null); }}
            className="mr-3 ml-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            {Object.keys(SORT_ORDERS).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50"
          >
            Load
          </button>
          <span className="ml-auto text-right text-xs" style={{ color: "#666" }}>{status}</span>
        </div>

        <div className="mx-4 flex-1 overflow-y-auto border border-gray-300 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-gray-100">
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => headerClick(c.key)}
                    className={`cursor-pointer select-none border-b border-gray-300 px-2 py-1 text-[11px] font-bold ${c.align} ${
                      c.key === "writing" || c.key === "context" ? "w-20" : c.key === "price" ? "w-[150px]" : ""
                    }`}
                  >
                    {c.heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  onDoubleClick={() => onSelect(r.id)}
                  className={`h-6 cursor-default ${r.id === selectedId ? "bg-blue-100" : "hover:bg-gray-50"}`}
                  style={r.isThinking ? { color: THINKING_FG } : undefined}
                >
                  <td className="truncate px-2 py-0.5 text-left">{r.name}</td>
                  <td className="px-2 py-0.5 text-center">{formatWriting(r)}</td>
                  <td className="px-2 py-0.5 text-center">{formatContext(r.context)}</td>
                  <td className="whitespace-nowrap px-2 py-0.5 text-right font-mono text-xs">
                    {formatPrice(r.priceIn)} / {formatPrice(r.priceOut)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 pb-3.5 pt-2">
          <div className="pb-0.5 text-[11px] font-bold">Description</div>
          <div className="h-28 overflow-y-auto border border-gray-400 bg-white px-2 py-1.5 text-sm whitespace-pre-wrap">
            {selected
              ? (selected.description || `${selected.name} — no description available.`)
              : "Select a model to see its description."}
          </div>
        </div>
      </div>
    </div>
  );
}
