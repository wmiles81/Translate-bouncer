import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelBrowser from "./ModelBrowser";

const sample = [
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    created: 1700000000,
    context_length: 200000,
    pricing: { prompt: "0.000003", completion: "0.000015" },
    supported_parameters: ["tools"],
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    created: 1750000000,
    context_length: 128000,
    pricing: { prompt: "0.000005", completion: "0.000020" },
    supported_parameters: [],
  },
  {
    id: "free-vendor/free-model",
    name: "Free Model",
    created: 1600000000,
    context_length: 8000,
    pricing: { prompt: "0", completion: "0" },
    supported_parameters: ["tools"],
  },
];

describe("ModelBrowser", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(sample), { status: 200 }))
    ) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("lists all models initially", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    expect(screen.getByText("GPT-5")).toBeInTheDocument();
    expect(screen.getByText("Free Model")).toBeInTheDocument();
  });

  it("filters by free only", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    await userEvent.click(screen.getByLabelText(/free only/i));
    expect(screen.queryByText("Claude Sonnet 4")).not.toBeInTheDocument();
    expect(screen.getByText("Free Model")).toBeInTheDocument();
  });

  it("filters by provider chip", async () => {
    render(<ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "openai" }));
    expect(screen.getByText("GPT-5")).toBeInTheDocument();
    expect(screen.queryByText("Claude Sonnet 4")).not.toBeInTheDocument();
  });

  it("calls onSelect with model id when row is clicked", async () => {
    const onSelect = vi.fn();
    render(<ModelBrowser initialValue="" onSelect={onSelect} onCancel={() => {}} />);
    await waitFor(() => expect(screen.getByText("GPT-5")).toBeInTheDocument());
    await userEvent.click(screen.getByText("GPT-5"));
    expect(onSelect).toHaveBeenCalledWith("openai/gpt-5");
  });

  it("renders tool-supporting models in red", async () => {
    const { container } = render(
      <ModelBrowser initialValue="" onSelect={() => {}} onCancel={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("Claude Sonnet 4")).toBeInTheDocument());
    // Claude has tools, GPT-5 doesn't.
    const claude = container.querySelector("span.text-red-600");
    expect(claude?.textContent).toMatch(/Claude|Free/);
  });
});
