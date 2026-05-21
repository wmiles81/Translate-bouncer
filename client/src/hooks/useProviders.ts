import { useEffect, useState } from "react";
import { getProviders } from "../api/settings";
import type { Provider } from "../types/api";

export function useProviders(): {
  providers: Provider[];
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    getProviders()
      .then(setProviders)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return { providers, refresh, loading, error };
}
