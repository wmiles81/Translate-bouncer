import { getProviders } from "../api/settings";
import type { Provider } from "../types/api";
import { useFetch } from "./useFetch";

export function useProviders(): {
  providers: Provider[];
  refresh: () => void;
  loading: boolean;
  error: Error | null;
} {
  const { data: providers, refresh, loading, error } = useFetch<Provider[]>(getProviders, []);
  return { providers, refresh, loading, error };
}
