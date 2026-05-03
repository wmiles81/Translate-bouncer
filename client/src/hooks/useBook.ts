import { useCallback, useEffect, useState } from "react";
import { getBook } from "../api/books";
import type { BookMeta } from "../types/api";

export function useBook(slug: string | undefined) {
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    getBook(slug)
      .then(setMeta)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meta, loading, error, refresh };
}
