import { useEffect, useState } from "react";
import { getModels } from "../api/settings";

export function useModels(): { models: string[]; refresh: () => void; loading: boolean; error: Error | null } {
  const [models, setModels] = useState<string[]>([]);
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
