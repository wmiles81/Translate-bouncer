import { useCallback, useEffect, useState } from "react";
import { deletePromptVersion, getPrompts, putPrompts, restorePrompt } from "../api/prompts";
import type { PromptFile, PromptKind } from "../types/api";

export function usePrompts(kind: PromptKind) {
  const [data, setData] = useState<PromptFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    getPrompts(kind)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [kind]);

  const save = useCallback(async (text: string) => {
    setData(await putPrompts(kind, text));
  }, [kind]);

  const restore = useCallback(async (versionId: string) => {
    setData(await restorePrompt(kind, versionId));
  }, [kind]);

  const remove = useCallback(async (versionId: string) => {
    setData(await deletePromptVersion(kind, versionId));
  }, [kind]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, save, restore, remove, loading, error, refresh };
}
