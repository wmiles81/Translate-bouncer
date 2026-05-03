import { useCallback, useEffect, useState } from "react";
import { getSettings, putSettings } from "../api/settings";
import type { Settings } from "../types/api";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    getSettings()
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (next: Settings) => {
    const updated = await putSettings(next);
    setSettings(updated);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { settings, save, loading, error, refresh };
}
