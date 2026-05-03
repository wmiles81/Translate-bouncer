export type Token =
  | { kind: "text"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "bold"; text: string };

export function parseMarkup(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      out.push({ kind: "text", text: buf });
      buf = "";
    }
  };

  while (i < s.length) {
    if (s.startsWith("**", i)) {
      const end = s.indexOf("**", i + 2);
      if (end === -1) {
        buf += s.slice(i);
        i = s.length;
        break;
      }
      flush();
      out.push({ kind: "bold", text: s.slice(i + 2, end) });
      i = end + 2;
    } else if (s[i] === "*") {
      const end = s.indexOf("*", i + 1);
      if (end === -1) {
        buf += s.slice(i);
        i = s.length;
        break;
      }
      flush();
      out.push({ kind: "italic", text: s.slice(i + 1, end) });
      i = end + 1;
    } else {
      buf += s[i];
      i += 1;
    }
  }
  flush();
  return out;
}
