import { useState } from "react";
import { usePrompts } from "../hooks/usePrompts";
import type { PromptKind } from "../types/api";

interface Props {
  kind: PromptKind;
}

export default function PromptEditor({ kind }: Props) {
  const { data, save, restore, remove, loading, error } = usePrompts(kind);
  const [draft, setDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <p className="text-sm text-gray-500">Loading {kind} prompt…</p>;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return null;

  const currentText = data.versions.find((v) => v.id === data.current)?.text ?? "";
  const text = draft ?? currentText;

  return (
    <details open className="rounded border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium capitalize">{kind} prompt</summary>
      <p className="mt-1 text-xs text-gray-500">Current: {data.current}</p>
      <textarea
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        className="mt-2 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            setActionError(null);
            try { await save(text); setDraft(null); }
            catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
          }}
          disabled={text === currentText}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          Save as new version
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
        >
          {showHistory ? "Hide" : "Show"} history ({data.versions.length})
        </button>
      </div>
      {showHistory && (
        <ul className="mt-3 space-y-1">
          {data.versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-xs">
              <span>
                <span className="font-mono">{v.id}</span>
                {v.id === data.current && <span className="ml-2 text-green-600">(current)</span>}
                <span className="ml-2 text-gray-400">{v.saved_at}</span>
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => alert(v.text)}
                  className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setActionError(null);
                    try { await restore(v.id); }
                    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
                  }}
                  disabled={v.id === data.current}
                  className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete ${v.id}?`)) return;
                    setActionError(null);
                    try { await remove(v.id); }
                    catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
                  }}
                  disabled={v.id === data.current}
                  className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {actionError && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700">
          {actionError}
        </p>
      )}
    </details>
  );
}
