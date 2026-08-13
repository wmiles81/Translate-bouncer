import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChapterRoute from "./ChapterRoute";

describe("ChapterRoute", () => {
  beforeEach(() => {
    // Stub EventSource to a no-op so useEvents doesn't throw
    (globalThis as unknown as { EventSource: unknown }).EventSource = class {
      onmessage: unknown = null;
      onerror: unknown = null;
      close() {}
    };
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
});
