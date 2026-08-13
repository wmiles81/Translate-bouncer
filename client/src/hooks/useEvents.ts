import { useEffect, useRef } from "react";
import type { AppEvent } from "../types/api";

export function useEvents(onEvent: (e: AppEvent) => void): void {
  // The EventSource connection is opened once, on mount, and kept for the
  // component's lifetime — but `onEvent` can close over per-render values
  // (e.g. route params) that change without a remount (React Router does not
  // remount a route element on a params-only navigation). Stashing the
  // latest handler in a ref, updated on every render, means es.onmessage
  // always calls the current handler instead of the one captured at mount.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/events");
    es.onmessage = (ev) => {
      try {
        handlerRef.current(JSON.parse(ev.data) as AppEvent);
      } catch {
        // ignore malformed
      }
    };
    return () => {
      es.close();
    };
    // intentionally only on mount; the connection itself doesn't need to be
    // reopened when the handler changes — handlerRef always has the latest.
  }, []);
}
