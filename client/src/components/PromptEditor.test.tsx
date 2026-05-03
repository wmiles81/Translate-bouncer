import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PromptEditor from "./PromptEditor";

describe("PromptEditor", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            current: "v2",
            versions: [
              { id: "v1", saved_at: "2026-05-02T00:00:00Z", text: "seed" },
              { id: "v2", saved_at: "2026-05-02T01:00:00Z", text: "edited" },
            ],
          }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads and displays current version text", async () => {
    render(<PromptEditor kind="editor" />);
    await waitFor(() => expect(screen.getByDisplayValue("edited")).toBeInTheDocument());
  });

  it("toggles history visibility", async () => {
    render(<PromptEditor kind="editor" />);
    await waitFor(() => expect(screen.getByDisplayValue("edited")).toBeInTheDocument());
    expect(screen.queryByText(/^v1$/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });
});
