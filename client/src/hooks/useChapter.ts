import { useCallback, useEffect, useState } from "react";
import { getChapterState } from "../api/chapters";
import { request } from "../api/client";
import type { ChapterMeta, ParsedDoc, ReviewerResult } from "../types/api";

interface DocsBundle {
  english: ParsedDoc;
  working: ParsedDoc;
  previous: ParsedDoc | null;
  suggestions: ReviewerResult | null;
}

export function useChapter(slug: string, n: number) {
  const [meta, setMeta] = useState<ChapterMeta | null>(null);
  const [docs, setDocs] = useState<DocsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cm, bundle] = await Promise.all([
        getChapterState(slug, n),
        request<DocsBundle>(`/books/${slug}/chapter/${n}/docs`),
      ]);
      setMeta(cm);
      setDocs(bundle);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [slug, n]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    meta,
    enDoc: docs?.english ?? null,
    workingDoc: docs?.working ?? null,
    prevDoc: docs?.previous ?? null,
    suggestions: docs?.suggestions ?? null,
    loading,
    error,
    refresh,
  };
}
