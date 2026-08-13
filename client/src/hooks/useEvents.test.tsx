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

  it("delivers events to the latest handler, not the one captured at mount", () => {
    // Regression test: the EventSource connection is opened once, on mount
    // (effect deps []), but a caller's onEvent callback can change on every
    // render (e.g. ChapterRoute's handler closes over route params like the
    // chapter number, which change on in-app navigation without a remount —
    // React Router doesn't remount a route element on a params-only nav).
    // If the handler were frozen at mount, a second event would still be
    // routed to the first render's stale closure.
    const seenFirst: AppEvent[] = [];
    const seenSecond: AppEvent[] = [];
    const { rerender } = render(
      <Probe onEvent={(e) => seenFirst.push(e)} />
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    const es = FakeEventSource.instances[0];

    act(() => {
      es.emit({ type: "status", text: "first" });
    });
    expect(seenFirst).toEqual([{ type: "status", text: "first" }]);
    expect(seenSecond).toEqual([]);

    // Re-render with a new onEvent closure. No new EventSource is opened —
    // same instance, same subscription — only the handler prop changed.
    rerender(<Probe onEvent={(e) => seenSecond.push(e)} />);
    expect(FakeEventSource.instances).toHaveLength(1);

    act(() => {
      es.emit({ type: "status", text: "second" });
    });
    // The stale-closure bug would have delivered this to seenFirst instead.
    expect(seenSecond).toEqual([{ type: "status", text: "second" }]);
    expect(seenFirst).toEqual([{ type: "status", text: "first" }]);
  });
});
