import { diffParagraphs } from "../lib/diff";
import type { ParsedDoc } from "../types/api";
import ParagraphRender from "./ParagraphRender";

interface Props {
  prev: ParsedDoc;
  next: ParsedDoc;
}

const COLOR: Record<"equal" | "insert" | "delete", string> = {
  equal: "",
  insert: "bg-green-50",
  delete: "bg-red-50 line-through text-red-800",
};

export default function DiffView({ prev, next }: Props) {
  const blocks = diffParagraphs(prev, next);
  return (
    <div>
      {blocks.map((b, i) => (
        <div key={i} className={`my-1 rounded px-1 ${COLOR[b.kind]}`}>
          <ParagraphRender paragraph={{ style: b.style, text: b.text }} />
        </div>
      ))}
    </div>
  );
}
