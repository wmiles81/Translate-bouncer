import { useState } from "react";
import type { ParsedDoc } from "../types/api";
import DiffView from "./DiffView";
import ParagraphRender from "./ParagraphRender";

interface Props {
  doc: ParsedDoc | null;
  prevDoc: ParsedDoc | null;
  roundN: number;
}

export default function WorkingPane({ doc, prevDoc, roundN }: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const canShowDiff = !!(doc && prevDoc);

  return (
    <section className="overflow-y-auto border-r border-gray-200 bg-white px-4 py-2">
      <div className="sticky top-0 mb-2 flex items-center justify-between bg-white py-1">
        <h2 className="text-xs font-semibold uppercase text-gray-500">
          Working translation {roundN > 0 ? `(round ${roundN})` : "(no rounds yet)"}
        </h2>
        <label className={`flex items-center gap-1 text-xs ${canShowDiff ? "" : "opacity-40"}`}>
          <input
            type="checkbox"
            checked={showDiff && canShowDiff}
            onChange={(e) => setShowDiff(e.target.checked)}
            disabled={!canShowDiff}
          />
          Show diff vs round {roundN - 1 < 1 ? "source" : roundN - 1}
        </label>
      </div>
      {showDiff && doc && prevDoc ? (
        <DiffView prev={prevDoc} next={doc} />
      ) : (
        doc?.paragraphs.map((p, i) => <ParagraphRender key={i} paragraph={p} />)
      )}
    </section>
  );
}
