import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ModelPicker from "./ModelPicker";
import type { Model } from "../types/api";

const sample: Model[] = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["tools"],
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    context_length: 128000,
    pricing: { prompt: "0.000005", completion: "0.000020" },
    supported_parameters: [],
  },
];

describe("ModelPicker", () => {
  it("button shows the current model's display name", () => {
    render(
      <ModelPicker
        label="Editor"
        value="anthropic/claude-sonnet-4"
        models={sample}
        onChange={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /editor/i })).toHaveTextContent("Claude Sonnet 4");
  });

  it("falls back to the value as label when no matching model", () => {
    render(<ModelPicker label="Editor" value="custom/x" models={sample} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /editor/i })).toHaveTextContent("custom/x");
  });

  it("shows '— select —' when value is empty and no match", () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /editor/i })).toHaveTextContent("— select —");
  });

  it("opens a popover with all models on click", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /editor/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument();
    expect(screen.getByText("GPT-5")).toBeInTheDocument();
  });

  it("emits onChange and closes when a row is clicked", async () => {
    const onChange = vi.fn();
    render(<ModelPicker label="Editor" value="" models={sample} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /editor/i }));
    await userEvent.click(screen.getByText("GPT-5"));
    expect(onChange).toHaveBeenCalledWith("openai/gpt-5");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("renders tool-supporting models in red text", async () => {
    const { container } = render(
      <ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />
    );
    await userEvent.click(screen.getByRole("button", { name: /editor/i }));
    const reds = container.querySelectorAll("span.text-red-600");
    // Claude has tools; GPT-5 doesn't.
    const texts = Array.from(reds).map((el) => el.textContent);
    expect(texts).toContain("Claude Sonnet 4");
    expect(texts).not.toContain("GPT-5");
  });

  it("shows pricing in the row", async () => {
    render(<ModelPicker label="Editor" value="" models={sample} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /editor/i }));
    expect(screen.getByText("$3.00/$15.00")).toBeInTheDocument();
  });

  it("sorts models by provider then by display name", async () => {
    const mixed = [
      { id: "openai/gpt-5", name: "GPT-5" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
    ];
    render(<ModelPicker label="Editor" value="" models={mixed} onChange={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /editor/i }));
    const options = screen.getAllByRole("option");
    // anthropic comes before openai alphabetically; within each, names sorted ascending.
    const order = options.map((o) => o.querySelector("span > span")?.textContent);
    expect(order).toEqual(["Claude Haiku 4.5", "Claude Sonnet 4", "GPT-5", "GPT-5 Mini"]);
  });
});
