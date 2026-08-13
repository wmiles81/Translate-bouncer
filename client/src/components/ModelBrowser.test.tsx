import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelBrowser from "./ModelBrowser";

const sample = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    description: "Anthropic's balanced model.",
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["reasoning"],
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    description: "OpenAI flagship.",
    context_length: 128000,
    pricing: { prompt: "0.000005", completion: "0.000020" },
    supported_parameters: [],
  },
  {
    id: "free-vendor/free-model",
    name: "Free Model",
    description: "",
    context_length: 8000,
    pricing: { prompt: "0", completion: "0" },
    supported_parameters: [],
  },
];

describe("ModelBrowser (ModelRouter-style table)", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(sample), { status: 200 }))
    ) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists all models in the table initially", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    expect(screen.getByText("GPT-5")).toBeInTheDocument();
    expect(screen.getByText("Free Model")).toBeInTheDocument();
    // Table headings from the reference design.
    for (const h of ["Model", "Writing", "Context", "$ In / Out"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it("filters with the Tier dropdown (Free)", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText("Tier"), "Free");
    expect(screen.queryByText("Claude Sonnet 4")).not.toBeInTheDocument();
    expect(screen.getByText("Free Model")).toBeInTheDocument();
  });

  it("single click selects and shows the description; double-click picks", async () => {
    const onSelect = vi.fn();
    render(<ModelBrowser initialValue="" onSelect={onSelect} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("GPT-5")).toBeInTheDocument());
    await userEvent.click(screen.getByText("GPT-5"));
    expect(onSelect).not.toHaveBeenCalled(); // single click only selects
    expect(screen.getByText("OpenAI flagship.")).toBeInTheDocument();
    await userEvent.dblClick(screen.getByText("GPT-5"));
    expect(onSelect).toHaveBeenCalledWith("openai/gpt-5");
  });

  it("renders thinking models in red (#c0152f)", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    const thinkingRow = screen.getByText("Claude Sonnet 4").closest("tr")!;
    expect(thinkingRow).toHaveStyle({ color: "#c0152f" });
    const plainRow = screen.getByText("GPT-5").closest("tr")!;
    expect(plainRow).not.toHaveStyle({ color: "#c0152f" });
  });

  it("formats context and per-million pricing like the reference", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    expect(screen.getByText("200k")).toBeInTheDocument();
    expect(screen.getByText("$3.00 / $15.00")).toBeInTheDocument();
    expect(screen.getByText("$0 / $0")).toBeInTheDocument();
  });

  it("sorts by clicking a column header (Context toggles asc/desc)", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Context"));
    let names = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(names[0]).toContain("Free Model"); // ascending: 8k first
    await userEvent.click(screen.getByText("Context"));
    names = screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(names[0]).toContain("Claude Sonnet 4"); // descending: 200k first
  });
});
