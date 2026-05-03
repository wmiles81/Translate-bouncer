import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SuggestionsPane from "./SuggestionsPane";

const sample = {
  round: 2,
  model: "openai/gpt-5",
  completed_at: "2026-05-02T00:00:00Z",
  suggestions: [
    { id: 1, quote: "Bonjour.", comment: "consider Salut" },
    { id: 2, quote: "froid", comment: "consider froide" },
  ],
  raw_response: "[]",
};

const dialogResponse = {
  rounds: [
    {
      n: 1,
      editor_model: "ed/m",
      editor_raw: "EDITOR ROUND 1 RAW",
      reviewer_model: "rv/m",
      reviewer_raw: "REVIEWER ROUND 1 RAW",
      suggestions: [{ id: 1, quote: "x", comment: "y" }],
    },
  ],
};

describe("SuggestionsPane", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.endsWith("/dialog")) {
          return new Response(JSON.stringify(dialogResponse), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseProps = { bookSlug: "book", chapterN: 1, currentRound: 1 };

  it("renders empty state when no result", () => {
    render(<SuggestionsPane result={null} {...baseProps} />);
    expect(screen.getByText(/click continue/i)).toBeInTheDocument();
  });

  it("renders suggestions", () => {
    render(<SuggestionsPane result={sample} {...baseProps} />);
    expect(screen.getByText("consider Salut")).toBeInTheDocument();
    expect(screen.getByText("consider froide")).toBeInTheDocument();
  });

  it("switches to Dialog tab and loads exchanges", async () => {
    render(<SuggestionsPane result={sample} {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /dialog/i }));
    await waitFor(() =>
      expect(screen.getByText(/EDITOR ROUND 1 RAW/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/REVIEWER ROUND 1 RAW/)).toBeInTheDocument();
  });
});
