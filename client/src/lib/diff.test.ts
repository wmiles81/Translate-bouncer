import { diffParagraphs } from "./diff";

describe("diffParagraphs", () => {
  it("returns equal blocks when both inputs match", () => {
    const out = diffParagraphs(
      { paragraphs: [{ style: "normal", text: "a" }] },
      { paragraphs: [{ style: "normal", text: "a" }] }
    );
    expect(out).toEqual([{ kind: "equal", text: "a", style: "normal" }]);
  });

  it("returns insert/delete blocks for changed paragraphs", () => {
    const out = diffParagraphs(
      { paragraphs: [{ style: "normal", text: "old" }] },
      { paragraphs: [{ style: "normal", text: "new" }] }
    );
    expect(out).toEqual([
      { kind: "delete", text: "old", style: "normal" },
      { kind: "insert", text: "new", style: "normal" },
    ]);
  });

  it("handles inserts at the end", () => {
    const out = diffParagraphs(
      { paragraphs: [{ style: "normal", text: "a" }] },
      { paragraphs: [
        { style: "normal", text: "a" },
        { style: "normal", text: "b" },
      ] }
    );
    expect(out).toContainEqual({ kind: "equal", text: "a", style: "normal" });
    expect(out).toContainEqual({ kind: "insert", text: "b", style: "normal" });
  });
});
