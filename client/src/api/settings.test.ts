import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModels, getSettings, putSettings } from "./settings";

describe("settings api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSettings calls GET /settings", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          openrouter_api_key: "x",
          default_models: { editor: "e", reviewer: "r" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
        }),
        { status: 200 }
      )
    );
    const s = await getSettings();
    expect(mock.mock.calls[0][0]).toBe("/settings");
    expect(s.default_models.editor).toBe("e");
  });

  it("putSettings calls PUT /settings with body", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          openrouter_api_key: "y",
          openrouter_api_key: "y",
      default_models: { editor: "m", reviewer: "" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
        }),
        { status: 200 }
      )
    );
    await putSettings({
      default_models: { editor: "m", reviewer: "" },
      ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
    });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string).default_models.editor).toBe("m");
  });

  it("getModels calls GET /models", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]), { status: 200 })
    );
    const out = await getModels();
    expect(mock.mock.calls[0][0]).toBe("/models");
    expect(out.map(m => m.id)).toEqual(["a", "b"]);
  });
});
