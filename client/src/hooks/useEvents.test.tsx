import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent } from "../types/api";
import { useEvents } from "./useEvents";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  emit(payload: AppEvent) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }
  close() {
    this.closed = true;
  }
}

function Probe({ onEvent }: { onEvent: (e: AppEvent) => void }) {
  useEvents(onEvent);
  return null;
}

describe("useEvents", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens an EventSource at /events on mount", () => {
    render(<Probe onEvent={() => {}} />);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/events");
  });

  it("calls handler with parsed event objects", () => {
    const seen: AppEvent[] = [];
    render(<Probe onEvent={(e) => seen.push(e)} />);
    act(() => {
      FakeEventSource.instances[0].emit({ type: "status", text: "hi" });
    });
    expect(seen).toEqual([{ type: "status", text: "hi" }]);
  });

  it("closes the connection on unmount", () => {
    const { unmount } = render(<Probe onEvent={() => {}} />);
    const es = FakeEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});
