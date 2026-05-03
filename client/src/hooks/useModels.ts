import { useEffect, useState } from "react";
import { getModels } from "../api/settings";
import type { Model } from "../types/api";

export function useModels(): {
  models: Model[];
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    getModels()
      .then(setModels)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return { models, refresh, loading, error };
}
