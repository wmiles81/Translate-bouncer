import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import StatusBar from "./StatusBar";

describe("StatusBar", () => {
  it("renders idle by default", () => {
    render(<StatusBar status="Idle" busy={false} canFinalize={false} onContinue={() => {}} onDone={() => {}} />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("disables Continue while busy", () => {
    render(<StatusBar status="Round 1 — Editor..." busy canFinalize onContinue={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("disables Done when canFinalize is false", () => {
    render(<StatusBar status="Idle" busy={false} canFinalize={false} onContinue={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
  });

  it("calls onContinue when Continue is clicked", async () => {
    const onContinue = vi.fn();
    render(<StatusBar status="Idle" busy={false} canFinalize onContinue={onContinue} onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("calls onDone when Done is clicked", async () => {
    const onDone = vi.fn();
    render(<StatusBar status="Idle" busy={false} canFinalize onContinue={() => {}} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
