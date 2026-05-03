import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsRoute from "./SettingsRoute";

describe("SettingsRoute", () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u === "/settings") {
        return Promise.resolve(new Response(JSON.stringify({
          openrouter_api_key: "sk-or-x",
          default_models: { editor: "anthropic/claude-sonnet-4", reviewer: "openai/gpt-5" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: ["^Chapter\\s+\\d+"] },
        }), { status: 200 }));
      }
      if (u === "/models") return Promise.resolve(new Response(JSON.stringify([
        "anthropic/claude-sonnet-4", "openai/gpt-5",
      ]), { status: 200 }));
      if (u === "/prompts/editor" || u === "/prompts/reviewer") {
        return Promise.resolve(new Response(JSON.stringify({
          current: "v1", versions: [{ id: "v1", saved_at: "2026-05-02T00:00:00Z", text: "seed" }],
        }), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads and displays current settings", async () => {
    render(
      <MemoryRouter>
        <SettingsRoute />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/api key/i)).toHaveValue("sk-or-x"));
    expect(screen.getByLabelText(/heading style/i)).toHaveValue("Heading 1");
  });
});
