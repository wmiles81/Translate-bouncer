import { render, screen } from "@testing-library/react";
import WorkingPane from "./WorkingPane";

describe("WorkingPane", () => {
  it("shows round number when > 0", () => {
    render(
      <WorkingPane
        doc={{ paragraphs: [{ style: "normal", text: "Bonjour." }] }}
        roundN={3}
      />
    );
    expect(screen.getByText(/round 3/i)).toBeInTheDocument();
    expect(screen.getByText("Bonjour.")).toBeInTheDocument();
  });

  it("shows no-rounds-yet label when round is 0", () => {
    render(<WorkingPane doc={null} roundN={0} />);
    expect(screen.getByText(/no rounds yet/i)).toBeInTheDocument();
  });
});
