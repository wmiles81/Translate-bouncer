import { useEffect, useRef, useState } from "react";
import {
  contextK,
  displayName,
  inputPrice,
  outputPrice,
  supportsTools,
} from "../lib/modelDisplay";
import type { Model } from "../types/api";

interface Props {
  label: string;
  value: string;
  models: Model[];
  onChange: (v: string) => void;
}

export default function ModelPicker({ label, value, models, onChange }: Props) {
  const [open, setOpen] = useState(false);
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

  const current = models.find((m) => m.id === value);
  const buttonLabel = current ? displayName(current) : value || "— select —";

  return (
    <div ref={ref} className="relative flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[10rem] items-center justify-between gap-2 rounded border border-gray-300 px-2 py-1 text-left text-sm hover:bg-gray-50"
      >
        <span className="truncate">{buttonLabel}</span>
        <span className="text-gray-400">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-1 max-h-96 w-[28rem] overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"
        >
          {models.length === 0 && (
            <p className="px-2 py-2 text-xs text-gray-500">No models loaded</p>
          )}
          {models.map((m) => {
            const tools = supportsTools(m);
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={selected}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  selected ? "bg-blue-50" : ""
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
            );
          })}
        </div>
      )}
    </div>
  );
}
