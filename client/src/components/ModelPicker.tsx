import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  type Row,
} from "../lib/modelTable";
import { useProviders } from "../hooks/useProviders";
import type { Model } from "../types/api";

// A dropdown list. The trigger shows the current model; the panel that opens
// beneath it is a faithful copy of the ModelRouter desktop app design
// (openrouter-show): Tier + Sort dropdowns, a sortable four-column table
// (Model | Writing | Context | $ In / Out) with thinking models in red, and a
// description strip. One click on a row picks it and closes the list.
//
// The provider selector in front lists the ROUTES a round can take — the four
// subscription CLIs (with live detection state) plus OpenRouter — not model-id
// prefixes. A CLI provider offers its single "<cli>/default" entry; OpenRouter
// offers the full catalog, whose rows carry the actual vendor.

const OPENROUTER = "openrouter";

interface Props {
  label: string;
  value: string;
  models: Model[];
  onChange: (v: string) => void;
}

export default function ModelPicker({ label, value, models, onChange }: Props) {
  const { providers: cliProviders } = useProviders();
  const [open, setOpen] = useState(false);
  // Route selector in front of the model dropdown; "" until data arrives.
  const [prov, setProv] = useState<string>("");
  const [tier, setTier] = useState<string>("All");
  const [sortLabel, setSortLabel] = useState<string>("Provider");
  // Header-click sort overrides the dropdown until the dropdown changes again.
  const [colSort, setColSort] = useState<{ col: ColKey; asc: boolean } | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Panels right-anchor to the trigger; near the viewport's left edge that
  // would clip, so flip to left-anchoring when it does.
  const [alignLeft, setAlignLeft] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !panelRef.current) return;
    setAlignLeft(panelRef.current.getBoundingClientRect().left < 8);
  }, [open]);

  const rows = useMemo(() => models.map(toRow), [models]);

  const cliIds = useMemo(() => new Set(cliProviders.map((p) => p.id)), [cliProviders]);
  // A row is a CLI route entry only in its exact "<cli>/default" form — the
  // OpenRouter org namespace collides with bare CLI names (e.g. qwen/qwen3-max).
  const isCliDefault = (r: { id: string; provider: string }) =>
    cliIds.has(r.provider) && r.id === `${r.provider}/default`;
  const openrouterAvailable = rows.some((r) => !isCliDefault(r));

  // Follow the route of an externally-changed value (settings finishing their
  // load, a batch restoring a saved model); default to OpenRouter, else the
  // first detected CLI, while the value is still empty.
  useEffect(() => {
    if (value) {
      const cli = cliProviders.find((p) => value === `${p.id}/default`);
      setProv(cli ? cli.id : OPENROUTER);
    } else if (openrouterAvailable) {
      setProv(OPENROUTER);
    } else {
      const first = cliProviders.find((p) => p.detected);
      if (first) setProv(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, cliProviders, openrouterAvailable]);

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

  const shown = useMemo(() => {
    const keep = TIERS[tier] ?? TIERS["All"];
    const onRoute = (r: Row) =>
      prov === OPENROUTER || prov === "" ? !isCliDefault(r) : r.id === `${prov}/default`;
    let out = rows.filter((r) => onRoute(r) && keep(r));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, prov, tier, sortLabel, colSort, cliIds]);

  const headerClick = (col: ColKey) => {
    setColSort((prev) => ({ col, asc: prev?.col === col ? !prev.asc : true }));
  };

  const current = rows.find((r) => r.id === value);
  const buttonLabel = current ? current.name : value || "— select —";
  const described = shown.find((r) => r.id === hoverId) ?? current;

  return (
    <div ref={ref} className="relative flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <select
        aria-label={`${label} provider`}
        value={prov}
        onChange={(e) => setProv(e.target.value)}
        className="max-w-[13rem] rounded border border-gray-300 bg-white px-1.5 py-1 text-sm"
      >
        {cliProviders.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.detected}>
            {p.detected ? `● ${p.name}` : `○ ${p.name} — not found`}
          </option>
        ))}
        <option value={OPENROUTER} disabled={!openrouterAvailable}>
          {openrouterAvailable ? "● OpenRouter" : "○ OpenRouter — set API key in Settings"}
        </option>
      </select>
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
          ref={panelRef}
          className={`absolute top-full z-50 mt-1 flex w-[44rem] max-w-[90vw] flex-col rounded border border-gray-300 shadow-lg ${
            alignLeft ? "left-0" : "right-0"
          }`}
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
                    <td colSpan={4} className="px-2 py-2 text-xs text-gray-500">No models match</td>
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
