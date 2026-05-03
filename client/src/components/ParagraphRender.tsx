import type { ParsedParagraph } from "../types/api";
import { parseMarkup } from "../lib/markup";

interface Props {
  paragraph: ParsedParagraph;
}

export default function ParagraphRender({ paragraph }: Props) {
  const tokens = parseMarkup(paragraph.text);
  const inner = tokens.map((t, i) => {
    if (t.kind === "italic") return <em key={i}>{t.text}</em>;
    if (t.kind === "bold") return <strong key={i}>{t.text}</strong>;
    return <span key={i}>{t.text}</span>;
  });

  if (paragraph.style === "normal") {
    return <p className="my-2 leading-relaxed">{inner}</p>;
  }
  const level = parseInt(paragraph.style.split("-")[1], 10);
  switch (level) {
    case 1: return <h1 className="my-3 text-xl font-bold">{inner}</h1>;
    case 2: return <h2 className="my-3 text-lg font-bold">{inner}</h2>;
    case 3: return <h3 className="my-3 text-base font-bold">{inner}</h3>;
    default: return <h4 className="my-3 text-sm font-bold">{inner}</h4>;
  }
}
