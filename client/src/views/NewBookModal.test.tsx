import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import NewBookModal from "./NewBookModal";

describe("NewBookModal", () => {
  it("renders the four fields", () => {
    render(<NewBookModal onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText(/translated path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/english path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source language/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
  });

  it("calls onSubmit with selected values (defaults: en source, fr target)", async () => {
    const onSubmit = vi.fn();
    render(<NewBookModal onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText(/translated path/i), "/path/to/fr");
    await userEvent.type(screen.getByLabelText(/english path/i), "/path/to/en");
    await userEvent.click(screen.getByRole("button", { name: /ingest/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      translated_path: "/path/to/fr",
      english_path: "/path/to/en",
      language_pair: { from: "en", to: "fr" },
    });
  });

  it("language selectors are dropdowns with English default for source", () => {
    render(<NewBookModal onSubmit={() => {}} onCancel={() => {}} />);
    const source = screen.getByLabelText(/source language/i) as HTMLSelectElement;
    const target = screen.getByLabelText(/target language/i) as HTMLSelectElement;
    expect(source.tagName).toBe("SELECT");
    expect(target.tagName).toBe("SELECT");
    expect(source.value).toBe("en");
    expect(target.value).toBe("fr");
  });

  it("emits BCP47-style codes (e.g. pt-BR) when a regional variant is selected", async () => {
    const onSubmit = vi.fn();
    render(<NewBookModal onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText(/translated path/i), "/p");
    await userEvent.type(screen.getByLabelText(/english path/i), "/p");
    await userEvent.selectOptions(
      screen.getByLabelText(/target language/i),
      "pt-BR"
    );
    await userEvent.click(screen.getByRole("button", { name: /ingest/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ language_pair: { from: "en", to: "pt-BR" } })
    );
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<NewBookModal onSubmit={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not submit when paths are empty", async () => {
    const onSubmit = vi.fn();
    render(<NewBookModal onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /ingest/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
