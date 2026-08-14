import { describe, expect, it, vi } from "vitest";
import { runBatch, type BatchEvent } from "./batchRunner";

vi.mock("../api/chapters", () => ({
  getChapterState: vi.fn(async () => ({ current_round: 0, rounds: [] })),
  runEditorRound: vi.fn(),
  runReviewerRound: vi.fn(),
  finalizeChapter: vi.fn(),
}));

import { runEditorRound, runReviewerRound } from "../api/chapters";

const chapters = [
  { n: 1, title: "One", status: "untouched" },
  { n: 2, title: "Two", status: "untouched" },
] as never[];

const baseOpts = {
  bookSlug: "b",
  chapters,
  editorModel: "e/m",
  reviewerModel: "r/m",
  roundsPerChapter: 1,
  finalize: false,
};

describe("runBatch stop semantics", () => {
  it("an aborted in-flight call ends the batch as stopped, not errored", async () => {
    const ctrl = new AbortController();
    vi.mocked(runEditorRound).mockImplementation(async (_s, _n, _m, signal) => {
      // Simulate "Stop now" arriving while the round is in flight.
      ctrl.abort();
      void signal;
      throw new DOMException("The user aborted a request.", "AbortError");
    });
    const events: BatchEvent[] = [];
    const result = await runBatch({
      ...baseOpts,
      shouldStop: () => ctrl.signal.aborted,
      signal: ctrl.signal,
      onProgress: (ev) => events.push(ev),
    });
    expect(result.stopped).toBe(true);
    expect(result.errors).toBe(0);
    expect(result.completed).toBe(0);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(vi.mocked(runEditorRound)).toHaveBeenCalledTimes(1); // no second chapter
  });

  it("shouldStop finishes the current chapter, then stops", async () => {
    let stop = false;
    vi.mocked(runEditorRound).mockImplementation(async () => {
      stop = true; // requested mid-chapter: chapter 1 still completes
      return { current_round: 1, rounds: [{ n: 1, reviewer_completed_at: null }] } as never;
    });
    vi.mocked(runReviewerRound).mockResolvedValue({} as never);
    const result = await runBatch({
      ...baseOpts,
      shouldStop: () => stop,
      onProgress: () => {},
    });
    expect(result.stopped).toBe(true);
    expect(result.completed).toBe(1); // chapter 1 finished; chapter 2 never started
  });
});
