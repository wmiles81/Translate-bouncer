import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelPicker from "./ModelPicker";

const providerList = [
  { id: "claude-code", name: "Claude Code (Claude Max)", detected: true },
  { id: "codex", name: "Codex (ChatGPT Plus/Pro)", detected: true },
  { id: "gemini", name: "Gemini CLI (Gemini AI Pro)", detected: true },
  { id: "qwen", name: "Qwen Code", detected: false },
];

const sample = [
  {
    id: "claude-code/default",
    name: "Claude Code (Claude Max) — CLI default model",
    description: "Runs on the CLI's default model.",
    source: "cli",
    context_length: null,
    pricing: { prompt: "0", completion: "0" },
    supported_parameters: [],
  },
  {
    id: "codex/default",
    name: "Codex (ChatGPT Plus/Pro) — CLI default model",
    description: "Runs on the CLI's default model.",
    source: "cli",
    context_length: null,
    pricing: { prompt: "0", completion: "0" },
    supported_parameters: [],
  },
  {
    // Discovered from the codex CLI's own models cache, pinned at adapter launch.
    id: "codex/gpt-5.5",
    name: "Codex — GPT-5.5",
    description: "Frontier model.",
    source: "cli",
    context_length: 272000,
    pricing: { prompt: "0", completion: "0" },
    supported_parameters: [],
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Anthropic's balanced model.",
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["reasoning"],
  },
  {
    id: "deepseek/deepseek-v4-pro",
    name: "DeepSeek: DeepSeek V4 Pro",
    description: "DeepSeek flagship.",
    context_length: 1048576,
    pricing: { prompt: "0.00000117", completion: "0.00000234" },
    supported_parameters: ["reasoning"],
  },
  {
    // OpenRouter org colliding with a CLI name: must stay under OpenRouter.
    id: "qwen/qwen3-max",
    name: "Qwen: Qwen3 Max",
    description: "Alibaba's Qwen3 Max via OpenRouter.",
    context_length: 256000,
    pricing: { prompt: "0.0000012", completion: "0.000006" },
    supported_parameters: [],
  },
];

function pickerWith(value: string, onChange: (v: string) => void = () => {}) {
  return <ModelPicker label="Editor" value={value} models={sample} onChange={onChange} />;
}

describe("ModelPicker (route selector + ModelRouter dropdown)", () => {
  beforeEach(() => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("/providers") ? providerList : sample;
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists the four CLIs (with detection) plus OpenRouter as the sources", async () => {
    render(pickerWith(""));
    const sel = screen.getByLabelText("Editor provider");
    await waitFor(() =>
      expect(within(sel).getByText(/Claude Code \(Claude Max\)/)).toBeInTheDocument()
    );
    expect(within(sel).getByText(/Codex \(ChatGPT Plus\/Pro\)/)).toBeInTheDocument();
    expect(within(sel).getByText(/Gemini CLI \(Gemini AI Pro\)/)).toBeInTheDocument();
    const qwen = within(sel).getByText(/Qwen Code — not found/) as HTMLOptionElement;
    expect(qwen.disabled).toBe(true); // undetected CLIs can't be picked
    expect(within(sel).getByText("● OpenRouter")).toBeInTheDocument();
  });

  it("the codex source lists every model its CLI cache knows, not just default", async () => {
    render(pickerWith(""));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).not.toHaveValue("")
    );
    await userEvent.selectOptions(screen.getByLabelText("Editor provider"), "codex");
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((r) => r.textContent ?? "");
    expect(names).toHaveLength(2);
    expect(names.join()).toContain("CLI default model");
    expect(names.join()).toContain("Codex — GPT-5.5");
  });

  it("a CLI source offers exactly its default entry", async () => {
    render(pickerWith(""));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).not.toHaveValue("")
    );
    await userEvent.selectOptions(screen.getByLabelText("Editor provider"), "claude-code");
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(1); // claude-code exposes only its CLI default
    expect(options[0]).toHaveTextContent("Claude Code (Claude Max) — CLI default model");
  });

  it("the OpenRouter source lists vendor models, including CLI-name collisions", async () => {
    render(pickerWith(""));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).toHaveValue("openrouter")
    );
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    const names = within(screen.getByRole("listbox"))
      .getAllByRole("option")
      .map((r) => r.textContent ?? "");
    expect(names).toHaveLength(3); // only vendor models; all CLI rows excluded
    expect(names.join()).toContain("Claude Sonnet 4"); // actual vendor: anthropic
    expect(names.join()).toContain("Qwen: Qwen3 Max"); // qwen/... stays OpenRouter
    expect(names.join()).not.toContain("CLI default model");
  });

  it("follows the current value's route", async () => {
    const { rerender } = render(pickerWith("claude-code/default"));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).toHaveValue("claude-code")
    );
    rerender(pickerWith("deepseek/deepseek-v4-pro"));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).toHaveValue("openrouter")
    );
  });

  it("one click on a row picks the model and closes the list", async () => {
    const onChange = vi.fn();
    render(pickerWith("", onChange));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).toHaveValue("openrouter")
    );
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    await userEvent.click(screen.getByText("DeepSeek: DeepSeek V4 Pro"));
    expect(onChange).toHaveBeenCalledWith("deepseek/deepseek-v4-pro");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the ModelRouter table: columns, red thinking rows, reference formats", async () => {
    render(pickerWith(""));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).toHaveValue("openrouter")
    );
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    for (const h of ["Model", "Writing", "Context", "$ In / Out"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    expect(screen.getByText("Claude Sonnet 4").closest("tr")).toHaveStyle({ color: "#c0152f" });
    expect(screen.getByText("Qwen: Qwen3 Max").closest("tr")).not.toHaveStyle({ color: "#c0152f" });
    expect(screen.getByText("200k")).toBeInTheDocument();
    expect(screen.getByText("$3.00 / $15.00")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(pickerWith(""));
    await waitFor(() =>
      expect(screen.getByLabelText("Editor provider")).toHaveValue("openrouter")
    );
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
