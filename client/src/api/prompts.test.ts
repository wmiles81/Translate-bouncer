import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePromptVersion, getPrompts, putPrompts, restorePrompt } from "./prompts";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe("prompts api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getPrompts URL", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v1", versions: [] })
    );
    await getPrompts("editor");
    expect(mock.mock.calls[0][0]).toBe("/prompts/editor");
  });

  it("putPrompts URL+method+body", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v2", versions: [] })
    );
    await putPrompts("reviewer", "new text");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/prompts/reviewer");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ text: "new text" });
  });

  it("restorePrompt URL+method", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v3", versions: [] })
    );
    await restorePrompt("editor", "v1");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/prompts/editor/restore/v1");
    expect(init.method).toBe("POST");
  });

  it("deletePromptVersion URL+method", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v2", versions: [] })
    );
    await deletePromptVersion("editor", "v1");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/prompts/editor/v1");
    expect(init.method).toBe("DELETE");
  });
});
