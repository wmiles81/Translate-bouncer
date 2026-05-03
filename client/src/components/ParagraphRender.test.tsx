import { render } from "@testing-library/react";
import ParagraphRender from "./ParagraphRender";

describe("ParagraphRender", () => {
  it("renders normal paragraph as <p>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "normal", text: "hi" }} />);
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("renders heading-1 as <h1>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "heading-1", text: "Chapter 1" }} />);
    expect(container.querySelector("h1")).toBeTruthy();
  });

  it("renders italic with <em>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "normal", text: "a *b* c" }} />);
    expect(container.querySelector("em")?.textContent).toBe("b");
  });

  it("renders bold with <strong>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "normal", text: "a **b** c" }} />);
    expect(container.querySelector("strong")?.textContent).toBe("b");
  });
});
