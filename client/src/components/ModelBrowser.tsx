import { useMemo, useState } from "react";
import { useModels } from "../hooks/useModels";
import {
  contextK,
  displayName,
  inputPrice,
  isFree,
  outputPrice,
  provider,
  supportsTools,
} from "../lib/modelDisplay";
type SortKey = "provider" | "created" | "context";

interface Props {
  initialValue: string;
  onSelect: (id: string) => void;
  onCancel: () => void;
}

export default function ModelBrowser({ initialValue, onSelect, onCancel }: Props) {
  const { models, loading, error, refresh } = useModels();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("provider");
  const [freeOnly, setFreeOnly] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());

  const providers = useMemo(() => {
    const s = new Set<string>();
    for (const m of models) s.add(provider(m));
    return Array.from(s).sort();
  }, [models]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = models.filter((m) => {
      if (freeOnly && !isFree(m)) return false;
      if (selectedProviders.size > 0 && !selectedProviders.has(provider(m))) return false;
      if (q) {
        const hay = `${m.id} ${m.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = out.slice().sort((a, b) => {
      if (sort === "provider") {
        const pa = provider(a), pb = provider(b);
        if (pa !== pb) return pa.localeCompare(pb);
        return displayName(a).localeCompare(displayName(b));
      }
      if (sort === "created") {
        return (b.created ?? 0) - (a.created ?? 0); // newest first
      }
      // context
      return (b.context_length ?? 0) - (a.context_length ?? 0); // largest first
    });
    return out;
  }, [models, search, sort, freeOnly, selectedProviders]);

  const toggleProvider = (p: string) => {
    setSelectedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col rounded bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <h2 className="text-lg font-semibold">Browse models</h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-2 py-0.5 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </header>

        <div className="space-y-2 border-b border-gray-200 px-4 py-2">
          <div className="flex gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by id or name…"
              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <label className="flex items-center gap-1 text-sm">
              <span className="text-gray-600">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="provider">Provider</option>
                <option value="created">Release date</option>
                <option value="context">Context size</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(e) => setFreeOnly(e.target.checked)}
              />
              Free only
            </label>
            <button
              type="button"
              onClick={refresh}
              className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
            >
              Refresh
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {providers.map((p) => {
              const active = selectedProviders.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleProvider(p)}
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    active
                      ? "bg-blue-600 text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              );
            })}
            {selectedProviders.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedProviders(new Set())}
                className="rounded-full px-2 py-0.5 text-xs text-gray-500 hover:underline"
              >
                clear
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {loading && <p className="p-3 text-sm text-gray-500">Loading…</p>}
          {error && <p className="p-3 text-sm text-red-600">{error.message}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="p-3 text-sm text-gray-500">No models match.</p>
          )}
          <ul>
            {filtered.map((m) => {
              const tools = supportsTools(m);
              const current = m.id === initialValue;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(m.id)}
                    className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
                      current ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="flex-1 truncate">
                      <span className={tools ? "text-red-600" : ""}>{displayName(m)}</span>
                      <span className="ml-2 text-xs text-gray-500">{contextK(m)}</span>
                    </span>
                    <span className="ml-auto whitespace-nowrap font-mono text-xs text-gray-600">
                      {inputPrice(m)} / {outputPrice(m)} per M
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
          {filtered.length} of {models.length} models · names in <span className="text-red-600">red</span> support tools
        </footer>
      </div>
    </div>
  );
}
