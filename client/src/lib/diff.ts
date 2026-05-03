import { diffArrays } from "diff";
import type { ParagraphStyle, ParsedDoc } from "../types/api";

export type DiffBlock = {
  kind: "equal" | "insert" | "delete";
  text: string;
  style: ParagraphStyle;
};

// Use a control character (U+0001) as delimiter to safely handle multi-word text
const DELIMITER = "";

function key(p: { style: ParagraphStyle; text: string }): string {
  return `${p.style}${DELIMITER}${p.text}`;
}

export function diffParagraphs(prev: ParsedDoc, next: ParsedDoc): DiffBlock[] {
  const a = prev.paragraphs.map(key);
  const b = next.paragraphs.map(key);
  const changes = diffArrays(a, b);
  const out: DiffBlock[] = [];
  for (const c of changes) {
    for (const k of c.value) {
      const idx = k.indexOf(DELIMITER);
      const style = k.slice(0, idx) as ParagraphStyle;
      const text = k.slice(idx + 1);
      const kind = c.added ? "insert" : c.removed ? "delete" : "equal";
      out.push({ kind, text, style });
    }
  }
  return out;
}
