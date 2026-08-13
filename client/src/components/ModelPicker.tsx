import { useEffect, useMemo, useRef, useState } from "react";
import {
  BG,
  COLUMNS,
  SORT_ORDERS,
  THINKING_FG,
  TIERS,
  compareTuples,
  formatContext,
  formatPrice,
  formatWriting,
  toRow,
  type ColKey,
} from "../lib/modelTable";
import type { Model } from "../types/api";

// A dropdown list. The trigger shows the current model; the panel that opens
// beneath it is a faithful copy of the ModelRouter desktop app design
// (openrouter-show): Tier + Sort dropdowns, a sortable four-column table
// (Model | Writing | Context | $ In / Out) with thinking models in red, and a
// description strip. One click on a row picks it and closes the list.

interface Props {
  label: string;
  value: string;
  models: Model[];
  onChange: (v: string) => void;
}

export default function ModelPicker({ label, value, models, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<string>("All");
  const [sortLabel, setSortLabel] = useState<string>("Provider");
  // Header-click sort overrides the dropdown until the dropdown changes again.
  const [colSort, setColSort] = useState<{ col: ColKey; asc: boolean } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

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

  const headerClick = (col: ColKey) => {
    setColSort((prev) => ({ col, asc: prev?.col === col ? !prev.asc : true }));
  };

  const current = rows.find((r) => r.id === value);
  const buttonLabel = current ? current.name : value || "— select —";
  const described = shown.find((r) => r.id === hoverId) ?? current;

  return (
    <div ref={ref} className="relative flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[10rem] items-center justify-between gap-2 rounded border border-gray-300 bg-white px-2 py-1 text-left text-sm hover:bg-gray-50"
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 flex w-[44rem] max-w-[90vw] flex-col rounded border border-gray-300 shadow-lg"
          style={{ backgroundColor: BG }}
        >
          <div className="flex items-center gap-1 px-3 pb-2 pt-2.5">
            <span className="text-sm">Tier:</span>
            <select
              aria-label="Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              className="mr-3 ml-1 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm"
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
              className="ml-1 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm"
            >
              {Object.keys(SORT_ORDERS).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <span className="ml-auto text-xs" style={{ color: "#666" }}>
              {shown.length} of {rows.length} models
            </span>
          </div>

          <div className="mx-3 max-h-80 overflow-y-auto border border-gray-300 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 bg-gray-100">
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => headerClick(c.key)}
                      className={`cursor-pointer select-none border-b border-gray-300 px-2 py-1 text-[11px] font-bold ${c.align} ${
                        c.key === "writing" || c.key === "context" ? "w-16" : c.key === "price" ? "w-[130px]" : ""
                      }`}
                    >
                      {c.heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody role="listbox" aria-label={`${label} models`}>
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-xs text-gray-500">No models loaded</td>
                  </tr>
                )}
                {shown.map((r) => (
                  <tr
                    key={r.id}
                    role="option"
                    aria-selected={r.id === value}
                    onClick={() => { onChange(r.id); setOpen(false); }}
                    onMouseEnter={() => setHoverId(r.id)}
                    className={`h-6 cursor-pointer ${r.id === value ? "bg-blue-100" : "hover:bg-gray-50"}`}
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

          <div className="px-3 pb-2.5 pt-1.5">
            <div className="pb-0.5 text-[11px] font-bold">Description</div>
            <div className="h-16 overflow-y-auto border border-gray-400 bg-white px-2 py-1 text-xs whitespace-pre-wrap">
              {described
                ? (described.description || `${described.name} — no description available.`)
                : "Hover a model to see its description."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
