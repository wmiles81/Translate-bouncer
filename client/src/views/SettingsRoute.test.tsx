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
          openrouter_api_key: "",
          default_models: { editor: "claude-code/default", reviewer: "z-ai/glm-4.7" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: ["^Chapter\\s+\\d+"] },
        }), { status: 200 }));
      }
      if (u === "/models") return Promise.resolve(new Response(JSON.stringify([
        { id: "claude-code/default", name: "Claude Code (Claude Max) — CLI default model", pricing: { prompt: "0", completion: "0" } },
        { id: "z-ai/glm-4.7", name: "GLM 4.7", pricing: { prompt: "0.0000004", completion: "0.0000016" } },
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
    // Default models render as dropdown triggers showing the model's display name.
    expect(screen.getByRole("button", { name: "Editor" })).toHaveTextContent(
      "Claude Code (Claude Max) — CLI default model"
    );
    expect(screen.getByRole("button", { name: "Reviewer" })).toHaveTextContent("GLM 4.7");
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
  });
});
