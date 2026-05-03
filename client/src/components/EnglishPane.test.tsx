import { render, screen } from "@testing-library/react";
import EnglishPane from "./EnglishPane";

describe("EnglishPane", () => {
  it("renders paragraphs from doc", () => {
    render(
      <EnglishPane
        doc={{
          paragraphs: [
            { style: "heading-1", text: "Chapter 1" },
            { style: "normal", text: "Hello." },
          ],
        }}
      />
    );
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Hello.")).toBeInTheDocument();
  });

  it("renders the heading label even when doc is null", () => {
    render(<EnglishPane doc={null} />);
    expect(screen.getByText(/english source/i)).toBeInTheDocument();
  });
});
