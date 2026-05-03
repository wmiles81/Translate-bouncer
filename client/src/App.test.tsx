import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";
import BookListRoute from "./views/BookListRoute";
import BookViewRoute from "./views/BookViewRoute";
import ChapterRoute from "./views/ChapterRoute";
import SettingsRoute from "./views/SettingsRoute";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<BookListRoute />} />
        <Route path="/book/:slug" element={<BookViewRoute />} />
        <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  // Stub EventSource so useEvents doesn't throw in jsdom
  (globalThis as unknown as { EventSource: unknown }).EventSource = class {
    onmessage: unknown = null;
    onerror: unknown = null;
    close() {}
  };
  // Stub fetch so hooks don't reject with network errors
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u === "/books" || u.startsWith("/books/")) {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    }
    if (u === "/models") return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    if (u === "/settings") return Promise.resolve(new Response(JSON.stringify({
      openrouter_api_key: "",
      default_models: { editor: "", reviewer: "" },
      ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
    }), { status: 200 }));
    return Promise.resolve(new Response(JSON.stringify(null), { status: 200 }));
  }) as unknown as typeof fetch;
});

afterEach(() => vi.restoreAllMocks());

describe("App routes", () => {
  it("renders BookListRoute at /", () => {
    renderAt("/");
    expect(screen.getByTestId("book-list-route")).toBeInTheDocument();
  });

  it("renders BookViewRoute at /book/:slug", () => {
    renderAt("/book/my-book");
    expect(screen.getByTestId("book-view-route")).toBeInTheDocument();
  });

  it("renders ChapterRoute at /book/:slug/chapter/:n", () => {
    renderAt("/book/my-book/chapter/2");
    expect(screen.getByTestId("chapter-route")).toBeInTheDocument();
  });

  it("renders SettingsRoute at /settings", () => {
    renderAt("/settings");
    expect(screen.getByTestId("settings-route")).toBeInTheDocument();
  });
});
