import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookViewRoute from "./BookViewRoute";

describe("BookViewRoute", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            slug: "le-livre",
            created_at: "2026-05-02T00:00:00Z",
            sources: {
              translated: { path: "/p/fr", format: "folder" },
              english: { path: "/p/en", format: "folder" },
            },
            language_pair: { from: "en", to: "fr" },
            chapters: [
              { n: 1, title: "Chapitre 1", status: "done" },
              { n: 2, title: "Chapitre 2", status: "in_progress" },
              { n: 3, title: "Chapitre 3", status: "untouched" },
            ],
          }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders chapters with statuses", async () => {
    render(
      <MemoryRouter initialEntries={["/book/le-livre"]}>
        <Routes>
          <Route path="/book/:slug" element={<BookViewRoute />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/Chapitre 1/)).toBeInTheDocument());
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    expect(screen.getByText("untouched")).toBeInTheDocument();
  });
});
