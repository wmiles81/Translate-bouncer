import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ModelPicker from "./ModelPicker";

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

describe("ModelPicker (ModelRouter-style dropdown)", () => {
  it("shows the current model's name on the trigger", () => {
    render(
      <ModelPicker label="Editor" value="openai/gpt-5" models={sample} onChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: "Editor" })).toHaveTextContent("GPT-5");
  });

  it("falls back to the raw id, then a placeholder", () => {
    render(<ModelPicker label="Editor" value="custom/x" models={sample} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Editor" })).toHaveTextContent("custom/x");
  });

  it("opens the table panel with the reference columns", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    for (const h of ["Model", "Writing", "Context", "$ In / Out"]) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(3);
  });

  it("one click on a row picks the model and closes the list", async () => {
    const onChange = vi.fn();
    render(<ModelPicker label="Editor" value="" models={sample} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    await userEvent.click(screen.getByText("GPT-5"));
    expect(onChange).toHaveBeenCalledWith("openai/gpt-5");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("filters with the Tier dropdown (Free)", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    await userEvent.selectOptions(screen.getByLabelText("Tier"), "Free");
    expect(screen.queryByText("Claude Sonnet 4")).not.toBeInTheDocument();
    expect(screen.getByText("Free Model")).toBeInTheDocument();
  });

  it("renders thinking models in red (#c0152f)", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByText("Claude Sonnet 4").closest("tr")).toHaveStyle({ color: "#c0152f" });
    expect(screen.getByText("GPT-5").closest("tr")).not.toHaveStyle({ color: "#c0152f" });
  });

  it("formats context and per-million pricing like the reference", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByText("200k")).toBeInTheDocument();
    expect(screen.getByText("$3.00 / $15.00")).toBeInTheDocument();
    expect(screen.getByText("$0 / $0")).toBeInTheDocument();
  });

  it("sorts by clicking a column header (Context toggles asc/desc)", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    await userEvent.click(screen.getByText("Context"));
    let names = within(screen.getByRole("listbox")).getAllByRole("option").map((r) => r.textContent ?? "");
    expect(names[0]).toContain("Free Model"); // ascending: 8k first
    await userEvent.click(screen.getByText("Context"));
    names = within(screen.getByRole("listbox")).getAllByRole("option").map((r) => r.textContent ?? "");
    expect(names[0]).toContain("Claude Sonnet 4"); // descending: 200k first
  });

  it("provider selector in front scopes the model list", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText("Editor provider"), "openai");
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent("GPT-5");
  });

  it("provider selector follows the current value's provider", () => {
    render(
      <ModelPicker label="Editor" value="anthropic/claude-sonnet-4" models={sample} onChange={() => {}} />
    );
    expect(screen.getByLabelText("Editor provider")).toHaveValue("anthropic");
  });

  it("closes on Escape", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Editor" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
