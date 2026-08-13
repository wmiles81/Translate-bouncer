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
          default_models: { editor: "claude-code/opus", reviewer: "gemini/gemini-2.5-pro" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: ["^Chapter\\s+\\d+"] },
        }), { status: 200 }));
      }
      if (u === "/models") return Promise.resolve(new Response(JSON.stringify([
        { id: "claude-code/opus", name: "Claude Opus", pricing: { prompt: "0", completion: "0" } },
        { id: "gemini/gemini-2.5-pro", name: "Gemini 2.5 Pro", pricing: { prompt: "0", completion: "0" } },
      ]), { status: 200 }));
      if (u === "/providers") return Promise.resolve(new Response(JSON.stringify([
        { id: "claude-code", name: "Claude Code", detected: true },
        { id: "gemini", name: "Gemini", detected: true },
        { id: "codex", name: "Codex", detected: false },
        { id: "qwen", name: "Qwen", detected: false },
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
    await waitFor(() => expect(screen.getByLabelText(/heading style/i)).toHaveValue("Heading 1"));
    expect(screen.getByDisplayValue("claude-code/opus")).toBeInTheDocument();
    expect(screen.getByDisplayValue("gemini/gemini-2.5-pro")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
  });
});
