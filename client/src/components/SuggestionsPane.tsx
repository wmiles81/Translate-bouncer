import { useState } from "react";
import type { ReviewerResult } from "../types/api";

interface Props {
  result: ReviewerResult | null;
}

export default function SuggestionsPane({ result }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-600 hover:bg-gray-100"
        aria-label="Expand suggestions"
      >
        ◀
      </button>
    );
  }

  return (
    <section className="overflow-y-auto bg-gray-50 px-4 py-2">
      <div className="sticky top-0 mb-2 flex items-center justify-between bg-gray-50 py-1">
        <h2 className="text-xs font-semibold uppercase text-gray-500">
          Reviewer suggestions
          {result && ` (round ${result.round})`}
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-gray-500 hover:text-gray-800"
          aria-label="Collapse suggestions"
        >
          ▶
        </button>
      </div>

      {!result && <p className="text-sm text-gray-500">Click Continue to run round 1.</p>}

      {result && result.suggestions.length === 0 && (
        <p className="text-sm text-gray-500">No suggestions returned.</p>
      )}

      {result && result.suggestions.length > 0 && (
        <ol className="space-y-3">
          {result.suggestions.map((s) => (
            <li key={s.id} className="rounded border border-gray-200 bg-white p-2 text-sm">
              <div className="mb-1 italic text-gray-600">"{s.quote}"</div>
              <div>{s.comment}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
