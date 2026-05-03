import type { ParsedDoc } from "../types/api";
import ParagraphRender from "./ParagraphRender";

interface Props {
  doc: ParsedDoc | null;
  roundN: number;
}

export default function WorkingPane({ doc, roundN }: Props) {
  return (
    <section className="overflow-y-auto border-r border-gray-200 bg-white px-4 py-2">
      <h2 className="sticky top-0 mb-2 bg-white py-1 text-xs font-semibold uppercase text-gray-500">
        Working translation {roundN > 0 ? `(round ${roundN})` : "(no rounds yet)"}
      </h2>
      {doc?.paragraphs.map((p, i) => <ParagraphRender key={i} paragraph={p} />)}
    </section>
  );
}
