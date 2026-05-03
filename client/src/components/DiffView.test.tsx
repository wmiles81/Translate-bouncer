import { render } from "@testing-library/react";
import DiffView from "./DiffView";

describe("DiffView", () => {
  it("renders insert/delete blocks", () => {
    const { container } = render(
      <DiffView
        prev={{ paragraphs: [{ style: "normal", text: "old" }] }}
        next={{ paragraphs: [{ style: "normal", text: "new" }] }}
      />
    );
    expect(container.querySelector(".bg-green-50")?.textContent).toBe("new");
    expect(container.querySelector(".bg-red-50")?.textContent).toBe("old");
  });
});
