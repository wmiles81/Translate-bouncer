import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChapter } from "./useChapter";

function Probe({ slug, n, onLoad }: { slug: string; n: number; onLoad: (s: ReturnType<typeof useChapter>) => void }) {
  const state = useChapter(slug, n);
  if (state.meta) onLoad(state);
  return null;
}

describe("useChapter", () => {
  beforeEach(() => {
    const meta = {
      n: 1,
      status: "untouched",
      current_round: 0,
      models: { editor: "", reviewer: "" },
      prompts_used: { editor_version: null, reviewer_version: null },
      rounds: [],
    };
    const docs = {
      english: { paragraphs: [{ style: "normal", text: "Hello." }] },
      working: { paragraphs: [{ style: "normal", text: "Bonjour." }] },
      previous: null,
      suggestions: null,
    };
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.endsWith("/state")) return Promise.resolve(new Response(JSON.stringify(meta), { status: 200 }));
      if (u.endsWith("/docs")) return Promise.resolve(new Response(JSON.stringify(docs), { status: 200 }));
      return Promise.reject(new Error(`unexpected URL ${u}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads meta + docs in parallel", async () => {
    let captured: ReturnType<typeof useChapter> | null = null;
    render(<Probe slug="x" n={1} onLoad={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.meta?.n).toBe(1));
    expect(captured?.enDoc?.paragraphs[0].text).toBe("Hello.");
    expect(captured?.workingDoc?.paragraphs[0].text).toBe("Bonjour.");
  });
});
