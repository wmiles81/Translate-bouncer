import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("SuggestionsPane", () => {
  it("renders empty state when no result", () => {
    render(<SuggestionsPane result={null} />);
    expect(screen.getByText(/click continue/i)).toBeInTheDocument();
  });

  it("renders suggestions", () => {
    render(<SuggestionsPane result={sample} />);
    expect(screen.getByText("consider Salut")).toBeInTheDocument();
    expect(screen.getByText("consider froide")).toBeInTheDocument();
  });

  it("collapses and expands", async () => {
    render(<SuggestionsPane result={sample} />);
    await userEvent.click(screen.getByLabelText(/collapse/i));
    expect(screen.queryByText("consider Salut")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/expand/i));
    expect(screen.getByText("consider Salut")).toBeInTheDocument();
  });
});
