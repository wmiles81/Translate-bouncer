import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookListRoute from "./BookListRoute";

describe("BookListRoute", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(["a-book", "b-book"]), { status: 200 }))
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists slugs from GET /books", async () => {
    render(
      <MemoryRouter>
        <BookListRoute />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("a-book")).toBeInTheDocument());
    expect(screen.getByText("b-book")).toBeInTheDocument();
  });

  it("shows empty state when no books", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReset();
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    render(
      <MemoryRouter>
        <BookListRoute />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/no books yet/i)).toBeInTheDocument());
  });
});
