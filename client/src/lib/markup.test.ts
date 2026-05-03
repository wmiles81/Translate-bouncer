import { parseMarkup } from "./markup";

describe("parseMarkup", () => {
  it("returns plain text as a single span", () => {
    expect(parseMarkup("hello")).toEqual([{ kind: "text", text: "hello" }]);
  });

  it("parses italic with single asterisks", () => {
    expect(parseMarkup("a *b* c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "italic", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("parses bold with double asterisks", () => {
    expect(parseMarkup("a **b** c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("handles unmatched asterisk as plain text", () => {
    expect(parseMarkup("foo *bar")).toEqual([{ kind: "text", text: "foo *bar" }]);
  });

  it("preserves Unicode", () => {
    expect(parseMarkup("« *froid* »")).toEqual([
      { kind: "text", text: "« " },
      { kind: "italic", text: "froid" },
      { kind: "text", text: " »" },
    ]);
  });
});
