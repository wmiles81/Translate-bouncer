import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WorkingPane from "./WorkingPane";

describe("WorkingPane", () => {
  it("shows round number when > 0", () => {
    render(
      <WorkingPane
        doc={{ paragraphs: [{ style: "normal", text: "Bonjour." }] }}
        prevDoc={null}
        roundN={3}
      />
    );
    expect(screen.getByText(/round 3/i)).toBeInTheDocument();
    expect(screen.getByText("Bonjour.")).toBeInTheDocument();
  });

  it("shows no-rounds-yet label when round is 0", () => {
    render(<WorkingPane doc={null} prevDoc={null} roundN={0} />);
    expect(screen.getByText(/no rounds yet/i)).toBeInTheDocument();
  });

  it("toggles diff view when both docs are present", async () => {
    render(
      <WorkingPane
        doc={{ paragraphs: [{ style: "normal", text: "new" }] }}
        prevDoc={{ paragraphs: [{ style: "normal", text: "old" }] }}
        roundN={2}
      />
    );
    expect(screen.queryByText("old")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/show diff/i));
    expect(screen.getByText("old")).toBeInTheDocument();
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("disables diff toggle when prev doc is missing", () => {
    render(
      <WorkingPane
        doc={{ paragraphs: [{ style: "normal", text: "x" }] }}
        prevDoc={null}
        roundN={0}
      />
    );
    expect(screen.getByLabelText(/show diff/i)).toBeDisabled();
  });
});
