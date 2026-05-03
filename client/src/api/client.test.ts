import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./client";

describe("request", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on 200", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ a: 1 }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const out = await request<{ a: number }>("/x");
    expect(out).toEqual({ a: 1 });
  });

  it("throws ApiError with parsed detail on non-2xx", async () => {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "bad key" }), { status: 400 })
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "bad key" }), { status: 400 })
    );
    await expect(request("/x")).rejects.toThrow(ApiError);
    try {
      await request("/x");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).detail).toBe("bad key");
    }
  });

  it("sends JSON body when provided", async () => {
    const fetchMock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    await request("/x", { method: "PUT", body: { a: 1 } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });
});
