import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import StatusBar, { type ActivityEntry } from "./StatusBar";

const empty: ActivityEntry[] = [];
const sample: ActivityEntry[] = [
  { id: 1, ts: Date.UTC(2026, 0, 1, 12, 0, 0), text: "Ch 1 R1 → Editor (m) · source: original translation", kind: "status" },
  { id: 2, ts: Date.UTC(2026, 0, 1, 12, 0, 5), text: "Ch 1 R1 ← Editor returned", kind: "status" },
  { id: 3, ts: Date.UTC(2026, 0, 1, 12, 0, 6), text: "✓ Ch 1 R1 editor complete", kind: "complete" },
];

describe("StatusBar", () => {
  it("shows 'Idle' when activity is empty", () => {
    render(
      <StatusBar
        activity={empty}
        busy={false}
        elapsed={0}
        canFinalize={false}
        onContinue={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.getByText("Idle")).toBeInTheDocument();
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });

  it("renders activity entries in the log", () => {
    render(
      <StatusBar
        activity={sample}
        busy={false}
        elapsed={0}
        canFinalize={false}
        onContinue={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.getByText(/Editor returned/)).toBeInTheDocument();
    expect(screen.getAllByText(/editor complete/).length).toBeGreaterThanOrEqual(1);
  });

  it("shows the most recent entry plus elapsed seconds when busy", () => {
    render(
      <StatusBar
        activity={sample}
        busy
        elapsed={12}
        canFinalize
        onContinue={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.getByText(/editor complete \(12s\)/)).toBeInTheDocument();
  });

  it("disables Continue while busy", () => {
    render(
      <StatusBar
        activity={empty}
        busy
        elapsed={0}
        canFinalize
        onContinue={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("disables Done when canFinalize is false", () => {
    render(
      <StatusBar
        activity={empty}
        busy={false}
        elapsed={0}
        canFinalize={false}
        onContinue={() => {}}
        onDone={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
  });

  it("calls onContinue when Continue is clicked", async () => {
    const onContinue = vi.fn();
    render(
      <StatusBar
        activity={empty}
        busy={false}
        elapsed={0}
        canFinalize
        onContinue={onContinue}
        onDone={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("calls onDone when Done is clicked", async () => {
    const onDone = vi.fn();
    render(
      <StatusBar
        activity={empty}
        busy={false}
        elapsed={0}
        canFinalize
        onContinue={() => {}}
        onDone={onDone}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
