import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { HelpProvider, useHelp } from "./HelpDrawer";

// The trigger has to live INSIDE the provider to reach the context.
function App() {
  return (
    <HelpProvider>
      <Trigger />
    </HelpProvider>
  );
}
function Trigger() {
  const help = useHelp();
  return <button type="button" onClick={() => help.open("settings")}>ask for help</button>;
}

describe("HelpDrawer", () => {
  // This environment ships no localStorage; stub one so the persistence
  // behaviour is still exercised.
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    };
  });

  it("stays closed until asked, then shows the handbook for that screen", async () => {
    render(<App />);
    // Closed: no iframe mounted, drawer marked hidden and slid off-screen.
    expect(screen.queryByTitle("Translate help")).toBeNull();
    expect(screen.getByTestId("help-drawer")).toHaveAttribute("aria-hidden", "true");

    await userEvent.click(screen.getByRole("button", { name: "ask for help" }));

    const frame = screen.getByTitle("Translate help") as HTMLIFrameElement;
    expect(frame.getAttribute("src")).toBe("/help/index.html?ctx=settings");
    expect(screen.getByTestId("help-drawer")).toHaveAttribute("aria-hidden", "false");
  });

  it("closes with the X button", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "ask for help" }));
    await userEvent.click(screen.getByRole("button", { name: "Close help" }));
    expect(screen.queryByTitle("Translate help")).toBeNull();
  });

  it("closes on Escape", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "ask for help" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByTitle("Translate help")).toBeNull();
  });

  it("widens and remembers the choice", async () => {
    const { unmount } = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "ask for help" }));
    expect(screen.getByTestId("help-drawer")).toHaveAttribute("data-wide", "0");

    await userEvent.click(screen.getByRole("button", { name: "Widen help" }));
    expect(screen.getByTestId("help-drawer")).toHaveAttribute("data-wide", "1");
    expect(globalThis.localStorage.getItem("translate-help-wide")).toBe("1");

    // Reopening a fresh app keeps the widened choice.
    unmount();
    render(<App />);
    expect(screen.getByTestId("help-drawer")).toHaveAttribute("data-wide", "1");
  });
});
