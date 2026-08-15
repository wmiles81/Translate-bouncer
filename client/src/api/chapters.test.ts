import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeChapter,
  getChapterState,
  runEditorRound,
  runReviewerRound,
} from "./chapters";

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("chapters api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getChapterState URL", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "untouched",
        current_round: 0,
        models: { editor: "", reviewer: "" },
        prompts_used: { editor_version: null, reviewer_version: null },
        rounds: [],
      })
    );
    await getChapterState("le-livre", 2);
    expect(mock.mock.calls[0][0]).toBe("/books/le-livre/chapter/2/state");
  });

  it("runEditorRound POST with model", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "in_progress",
        current_round: 1,
        models: { editor: "m", reviewer: "" },
        prompts_used: { editor_version: "v1", reviewer_version: null },
        rounds: [],
      })
    );
    await runEditorRound("x", 1, "anthropic/claude-sonnet-4");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books/x/chapter/1/round/editor");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "anthropic/claude-sonnet-4",
      apply_suggestions: false, // a plain pass opens a new round
    });
  });

  it("runEditorRound can apply this round's suggestions instead of opening a new round", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "in_progress",
        current_round: 1,
        models: { editor: "m", reviewer: "" },
        prompts_used: { editor_version: "v1", reviewer_version: null },
        rounds: [],
      })
    );
    await runEditorRound("x", 1, "m", undefined, true);
    const [, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ model: "m", apply_suggestions: true });
  });

  it("runReviewerRound POST with model", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        round: 1,
        model: "openai/gpt-5",
        completed_at: "2026-05-02T00:00:00Z",
        suggestions: [],
        raw_response: "[]",
      })
    );
    await runReviewerRound("x", 1, "openai/gpt-5");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books/x/chapter/1/round/reviewer");
    expect(init.method).toBe("POST");
  });

  it("finalizeChapter POST", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "done",
        current_round: 1,
        models: { editor: "", reviewer: "" },
        prompts_used: { editor_version: null, reviewer_version: null },
        rounds: [],
      })
    );
    await finalizeChapter("x", 1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books/x/chapter/1/finalize");
    expect(init.method).toBe("POST");
  });
});
