import { useCallback, useEffect, useState } from "react";

/** Fetch-on-mount state triple shared by useModels/useProviders. */
export function useFetch<T>(fetcher: () => Promise<T>, initial: T): {
  data: T;
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    fetcher()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
    // fetcher is a module-level API function; identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refetch when the tab regains focus. A long-open tab otherwise keeps the list
  // it loaded at mount — so a provider signed into (or a server restarted with
  // new models) since then stays invisible until a manual reload.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "hidden") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  return { data, refresh, loading, error };
}
