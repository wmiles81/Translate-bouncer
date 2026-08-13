import type {
  AppEvent,
  BookMeta,
  ChapterMeta,
  ChapterStatus,
  ParagraphStyle,
  Settings,
} from "./api";

describe("api types", () => {
  it("ChapterStatus accepts the three documented values", () => {
    const a: ChapterStatus = "untouched";
    const b: ChapterStatus = "in_progress";
    const c: ChapterStatus = "done";
    expect([a, b, c]).toEqual(["untouched", "in_progress", "done"]);
  });

  it("ParagraphStyle accepts heading-1..6 and normal", () => {
    const styles: ParagraphStyle[] = [
      "normal",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
    ];
    expect(styles.length).toBe(7);
  });

  it("BookMeta has language_pair with `from` (not `from_`)", () => {
    const bm: BookMeta = {
      slug: "x",
      created_at: "2026-05-02T00:00:00Z",
      sources: {
        translated: { path: "/a", format: "folder" },
        english: { path: "/b", format: "single-docx" },
      },
      language_pair: { from: "en", to: "fr" },
      chapters: [{ n: 1, title: "Ch 1", status: "untouched" }],
    };
    expect(bm.language_pair.from).toBe("en");
  });

  it("ChapterMeta starts with current_round=0 and untouched", () => {
    const cm: ChapterMeta = {
      n: 1,
      status: "untouched",
      current_round: 0,
      models: { editor: "", reviewer: "" },
      prompts_used: { editor_version: null, reviewer_version: null },
      rounds: [],
    };
    expect(cm.current_round).toBe(0);
  });

  it("AppEvent is a discriminated union", () => {
    const e1: AppEvent = { type: "status", text: "hi" };
    const e2: AppEvent = { type: "round_complete", round: 1, stage: "editor" };
    const e3: AppEvent = { type: "error", text: "boom" };
    const e4: AppEvent = { type: "stop" };
    expect([e1.type, e2.type, e3.type, e4.type]).toEqual(["status", "round_complete", "error", "stop"]);
  });

  it("Settings shape matches server", () => {
    const s: Settings = {
      openrouter_api_key: "",
      default_models: { editor: "", reviewer: "" },
      ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
    };
    expect(s.default_models.editor).toBe("");
  });
});
