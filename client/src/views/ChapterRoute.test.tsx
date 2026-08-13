import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent } from "../types/api";
import ChapterRoute from "./ChapterRoute";

// Same FakeEventSource pattern as hooks/useEvents.test.tsx: capture instances
// so tests can drive `.emit(...)` to simulate server-sent events.
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

function emitEvent(payload: AppEvent) {
  act(() => {
    FakeEventSource.instances[FakeEventSource.instances.length - 1].emit(payload);
  });
}

describe("ChapterRoute", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u === "/books/x") {
        return Promise.resolve(new Response(JSON.stringify({
          slug: "x",
          created_at: "2026-05-02T00:00:00Z",
          sources: { translated: { path: "/p/fr", format: "folder" }, english: { path: "/p/en", format: "folder" } },
          language_pair: { from: "en", to: "fr" },
          chapters: [{ n: 1, title: "Ch 1", status: "untouched" }],
        }), { status: 200 }));
      }
      if (u === "/books/x/chapter/1/state") {
        return Promise.resolve(new Response(JSON.stringify({
          n: 1, status: "untouched", current_round: 0,
          models: { editor: "", reviewer: "" },
          prompts_used: { editor_version: null, reviewer_version: null },
          rounds: [],
        }), { status: 200 }));
      }
      if (u === "/books/x/chapter/1/docs") {
        return Promise.resolve(new Response(JSON.stringify({
          english: { paragraphs: [{ style: "normal", text: "Hello." }] },
          working: { paragraphs: [{ style: "normal", text: "Bonjour." }] },
          previous: null,
          suggestions: null,
        }), { status: 200 }));
      }
      if (u === "/models") return Promise.resolve(new Response(JSON.stringify([{ id: "m1" }, { id: "m2" }]), { status: 200 }));
      if (u === "/settings") return Promise.resolve(new Response(JSON.stringify({
        default_models: { editor: "m1", reviewer: "m2" },
        ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
      }), { status: 200 }));
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the three panes after loading", async () => {
    render(
      <MemoryRouter initialEntries={["/book/x/chapter/1"]}>
        <Routes>
          <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Hello.")).toBeInTheDocument());
    expect(screen.getByText("Bonjour.")).toBeInTheDocument();
    expect(screen.getByText(/click continue/i)).toBeInTheDocument();
  });

  it("ignores token events from other chapters and resets on retry", async () => {
    render(
      <MemoryRouter initialEntries={["/book/x/chapter/1"]}>
        <Routes>
          <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Hello.")).toBeInTheDocument());

    emitEvent({ type: "token", chapter: 7, text: "WRONG-CHAPTER" });
    emitEvent({ type: "token", chapter: 1, text: "mine" });
    expect(await screen.findByText(/mine/)).toBeInTheDocument();
    expect(screen.queryByText(/WRONG-CHAPTER/)).toBeNull();

    emitEvent({ type: "status", chapter: 1, phase: "retry", text: "retrying" });
    emitEvent({ type: "token", chapter: 1, text: "attempt2" });
    expect(await screen.findByText(/attempt2/)).toBeInTheDocument();
    expect(screen.queryByText(/mine/)).toBeNull(); // buffer was reset on retry
  });
});
