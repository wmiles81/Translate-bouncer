import { useCallback, useEffect, useState } from "react";
import { listBooks } from "../api/books";

export function useBooks(): { slugs: string[]; refresh: () => void; loading: boolean; error: Error | null } {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listBooks()
      .then(setSlugs)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { slugs, refresh, loading, error };
}
