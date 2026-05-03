import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ModelPicker from "./ModelPicker";

describe("ModelPicker", () => {
  it("renders options and current value", () => {
    render(<ModelPicker label="Editor" value="a" options={["a", "b"]} onChange={() => {}} />);
    expect(screen.getByLabelText(/editor/i)).toHaveValue("a");
  });

  it("emits onChange when user picks a different option", async () => {
    const onChange = vi.fn();
    render(<ModelPicker label="Editor" value="a" options={["a", "b"]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/editor/i), "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("includes the current value as an option even if not in the list", () => {
    render(<ModelPicker label="Editor" value="custom/x" options={["a", "b"]} onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "custom/x" })).toBeInTheDocument();
  });
});
