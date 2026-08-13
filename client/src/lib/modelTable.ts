// Shared data/format layer for the ModelRouter-style model dropdown, mirroring
// openrouter-show/openrouter_tk.py: row normalization, EQ-Bench writing-score
// join, tier filters, sort orders, and the reference's exact display formats.
import eqbenchData from "../data/eqbench_scores.json";
import type { Model } from "../types/api";

export const BG = "#f4f4f7";
export const THINKING_FG = "#c0152f";

const EQBENCH: Record<string, { elo?: number; rubric?: number }> =
  (eqbenchData as { scores?: Record<string, { elo?: number; rubric?: number }> }).scores ?? {};

export interface Row {
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

export function toRow(m: Model): Row {
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
export function formatContext(ctx: number): string {
  if (!ctx) return "—";
  return ctx >= 1000 ? `${Math.floor(ctx / 1000)}k` : String(ctx);
}

// $/million-tokens -> short string. Keeps small prices readable.
export function formatPrice(value: number): string {
  if (value === 0) return "$0";
  if (value < 1) return `$${value.toFixed(3)}`.replace(/0+$/, "").replace(/\.$/, "");
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// EQ-Bench Elo as an integer string, or '—' when unscored.
export function formatWriting(row: Row): string {
  return row.writingElo ? String(Math.round(row.writingElo)) : "—";
}

// Keyed by the exact label shown in the dropdown, so the option values and the
// logic that backs them can never drift apart. Price tiers are CUMULATIVE.
export const TIERS: Record<string, (r: Row) => boolean> = {
  "All": () => true,
  "Free": (r) => r.priceIn === 0 && r.priceOut === 0,
  "Cheap (<$1/M)": (r) => r.priceOut < 1.0,
  "Medium (<$5/M)": (r) => r.priceOut < 5.0,
  "Has writing score": (r) => r.writingElo !== null,
  "Good writers (≥1300)": (r) => (r.writingElo ?? 0) >= 1300,
  "Great writers (≥1500)": (r) => (r.writingElo ?? 0) >= 1500,
};

type SortTuple = (r: Row) => (string | number)[];
export const SORT_ORDERS: Record<string, SortTuple> = {
  "Provider": (r) => [r.provider, r.id],
  "Writing (high→low)": (r) => [-(r.writingElo ?? -Infinity), r.provider, r.id],
  "Context (high→low)": (r) => [-r.context, r.provider, r.id],
  "Price (low→high)": (r) => [r.priceOut, r.provider, r.id],
};

export type ColKey = "model" | "writing" | "context" | "price";

// Table columns: heading, alignment, per-column sort key — as in the reference.
export const COLUMNS: { key: ColKey; heading: string; align: string; sort: (r: Row) => string | number }[] = [
  { key: "model", heading: "Model", align: "text-left", sort: (r) => r.id },
  { key: "writing", heading: "Writing", align: "text-center", sort: (r) => r.writingElo ?? -Infinity },
  { key: "context", heading: "Context", align: "text-center", sort: (r) => r.context },
  { key: "price", heading: "$ In / Out", align: "text-right", sort: (r) => r.priceOut },
];

export function compareTuples(a: (string | number)[], b: (string | number)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}
