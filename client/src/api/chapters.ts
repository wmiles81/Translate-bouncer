import type { ChapterDialog, ChapterMeta, ReviewerResult } from "../types/api";
import { request } from "./client";

export const getChapterState = (slug: string, n: number) =>
  request<ChapterMeta>(`/books/${slug}/chapter/${n}/state`);

export const runEditorRound = (
  slug: string,
  n: number,
  model: string,
  signal?: AbortSignal,
  // The in-round pass applying this round's reviewer suggestions; it completes
  // the round instead of opening a new one.
  applySuggestions = false,
) =>
  request<ChapterMeta>(`/books/${slug}/chapter/${n}/round/editor`, {
    method: "POST",
    body: { model, apply_suggestions: applySuggestions },
    signal,
  });

export const runReviewerRound = (slug: string, n: number, model: string, signal?: AbortSignal) =>
  request<ReviewerResult>(`/books/${slug}/chapter/${n}/round/reviewer`, {
    method: "POST",
    body: { model },
    signal,
  });

export const finalizeChapter = (slug: string, n: number, signal?: AbortSignal) =>
  request<ChapterMeta>(`/books/${slug}/chapter/${n}/finalize`, { method: "POST", signal });

export const getChapterDialog = (slug: string, n: number) =>
  request<ChapterDialog>(`/books/${slug}/chapter/${n}/dialog`);
