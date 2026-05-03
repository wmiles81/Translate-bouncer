import { finalizeChapter, runEditorRound, runReviewerRound } from "../api/chapters";
import type { ChapterEntry } from "../types/api";

export interface BatchEvent {
  type: "chapter_start" | "round_start" | "round_done" | "chapter_done" | "error" | "done";
  chapterN?: number;
  chapterTitle?: string;
  chapterIndex?: number; // 1-based index within the batch
  totalChapters?: number;
  roundN?: number;
  totalRounds?: number;
  stage?: "editor" | "reviewer" | "finalize";
  error?: string;
}

export interface BatchRunOptions {
  bookSlug: string;
  chapters: ChapterEntry[];
  editorModel: string;
  reviewerModel: string;
  roundsPerChapter: number;
  finalize: boolean;
  onProgress: (event: BatchEvent) => void;
  shouldStop: () => boolean;
}

export interface BatchSummary {
  completed: number;
  errors: number;
  stopped: boolean;
}

/**
 * Iterate through chapters, doing N rounds (editor + reviewer) per chapter
 * and optionally finalizing each. Errors on a chapter are reported via
 * onProgress but don't abort the batch — the next chapter still runs.
 *
 * `shouldStop` is checked between chapters and between rounds. An in-flight
 * HTTP call is not interrupted.
 */
export async function runBatch(opts: BatchRunOptions): Promise<BatchSummary> {
  let completed = 0;
  let errors = 0;
  let stopped = false;

  for (let i = 0; i < opts.chapters.length; i++) {
    if (opts.shouldStop()) {
      stopped = true;
      break;
    }
    const ch = opts.chapters[i];
    opts.onProgress({
      type: "chapter_start",
      chapterN: ch.n,
      chapterTitle: ch.title,
      chapterIndex: i + 1,
      totalChapters: opts.chapters.length,
    });

    let chapterError = false;
    try {
      for (let r = 1; r <= opts.roundsPerChapter; r++) {
        if (opts.shouldStop()) {
          stopped = true;
          break;
        }
        opts.onProgress({
          type: "round_start",
          chapterN: ch.n,
          roundN: r,
          totalRounds: opts.roundsPerChapter,
          stage: "editor",
        });
        await runEditorRound(opts.bookSlug, ch.n, opts.editorModel);
        opts.onProgress({
          type: "round_start",
          chapterN: ch.n,
          roundN: r,
          totalRounds: opts.roundsPerChapter,
          stage: "reviewer",
        });
        await runReviewerRound(opts.bookSlug, ch.n, opts.reviewerModel);
        opts.onProgress({
          type: "round_done",
          chapterN: ch.n,
          roundN: r,
          totalRounds: opts.roundsPerChapter,
        });
      }
      if (opts.finalize && !opts.shouldStop()) {
        opts.onProgress({
          type: "round_start",
          chapterN: ch.n,
          stage: "finalize",
        });
        await finalizeChapter(opts.bookSlug, ch.n);
      }
    } catch (e) {
      chapterError = true;
      const detail = (e as { detail?: unknown })?.detail;
      let msg = e instanceof Error ? e.message : String(e);
      if (detail && typeof detail === "object" && "message" in (detail as Record<string, unknown>)) {
        msg = `${msg}: ${(detail as { message: string }).message}`;
      }
      opts.onProgress({ type: "error", chapterN: ch.n, error: msg });
      errors++;
    }

    if (!chapterError) {
      opts.onProgress({ type: "chapter_done", chapterN: ch.n });
      completed++;
    }
  }

  opts.onProgress({ type: "done" });
  return { completed, errors, stopped };
}
