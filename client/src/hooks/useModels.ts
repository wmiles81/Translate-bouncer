import { getModels } from "../api/settings";
import type { Model } from "../types/api";
import { useFetch } from "./useFetch";

export function useModels(): {
  models: Model[];
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const { data: models, refresh, loading, error } = useFetch<Model[]>(getModels, []);
  return { models, refresh, loading, error };
}
