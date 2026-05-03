import { useEffect } from "react";
import type { AppEvent } from "../types/api";

export function useEvents(onEvent: (e: AppEvent) => void): void {
  useEffect(() => {
    const es = new EventSource("/events");
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as AppEvent);
      } catch {
        // ignore malformed
      }
    };
    return () => {
      es.close();
    };
    // intentionally only on mount; handler is captured at mount time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
