import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBook, ingestBook, listBooks } from "./books";

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("books api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listBooks calls GET /books", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson(["a", "b"])
    );
    const out = await listBooks();
    expect(mock.mock.calls[0][0]).toBe("/books");
    expect(out).toEqual(["a", "b"]);
  });

  it("ingestBook POSTs the request body", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ slug: "my-book" })
    );
    await ingestBook({
      translated_path: "/p/fr",
      english_path: "/p/en",
      language_pair: { from: "en", to: "fr" },
    });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.translated_path).toBe("/p/fr");
    expect(body.language_pair).toEqual({ from: "en", to: "fr" });
  });

  it("ingestBook includes on_collision when provided", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ slug: "x" })
    );
    await ingestBook({
      translated_path: "/p/fr",
      english_path: "/p/en",
      language_pair: { from: "en", to: "fr" },
      on_collision: "resume",
    });
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).on_collision).toBe("resume");
  });

  it("getBook calls GET /books/:slug", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        slug: "x",
        created_at: "2026-05-02T00:00:00Z",
        sources: {
          translated: { path: "/a", format: "folder" },
          english: { path: "/b", format: "folder" },
        },
        language_pair: { from: "en", to: "fr" },
        chapters: [],
      })
    );
    const bm = await getBook("x");
    expect(mock.mock.calls[0][0]).toBe("/books/x");
    expect(bm.slug).toBe("x");
  });
});
