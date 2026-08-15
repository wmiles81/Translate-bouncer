import type { BookMeta, LanguagePair } from "../types/api";
import { request } from "./client";

export interface IngestRequest {
  translated_path: string;
  english_path: string;
  language_pair: LanguagePair;
  on_collision?: "resume" | "new-session";
}
export interface IngestResponse {
  slug: string;
}

export const listBooks = () => request<string[]>("/books");

export const ingestBook = (req: IngestRequest) =>
  request<IngestResponse>("/books", { method: "POST", body: req });

export const getBook = (slug: string) => request<BookMeta>(`/books/${slug}`);

/** Remove a book from the list. Files stay on disk under ~/.translate/<slug>/. */
export const deleteBook = (slug: string) =>
  request<{ slug: string; removed: boolean; files_kept_at: string }>(`/books/${slug}`, {
    method: "DELETE",
  });

/** Restore a book to its freshly-ingested state. Edits are archived, not deleted. */
export const restoreBook = (slug: string) =>
  request<{ slug: string; restored: boolean; files_archived: number }>(
    `/books/${slug}/restore`,
    { method: "POST" },
  );

/** Finalize every chapter that has a completed round. Untouched ones are skipped. */
export const finalizeAllChapters = (slug: string) =>
  request<{ slug: string; finalized: number[]; skipped: { n: number; reason: string }[] }>(
    `/books/${slug}/finalize-all`,
    { method: "POST" },
  );
