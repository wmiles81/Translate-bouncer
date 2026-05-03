import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import TopBar from "./TopBar";

const chapters = [
  { n: 1, title: "One", status: "done" as const },
  { n: 2, title: "Two", status: "in_progress" as const },
];

describe("TopBar", () => {
  it("renders chapter selector and model pickers", () => {
    render(
      <MemoryRouter>
        <TopBar
          bookSlug="x"
          chapters={chapters}
          currentN={2}
          editorModel="ed"
          reviewerModel="rv"
          modelOptions={["ed", "rv", "other"]}
          onEditorModelChange={() => {}}
          onReviewerModelChange={() => {}}
          onChapterChange={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/chapter/i)).toHaveValue("2");
    expect(screen.getByLabelText(/editor/i)).toHaveValue("ed");
    expect(screen.getByLabelText(/reviewer/i)).toHaveValue("rv");
  });

  it("calls onChapterChange when selecting a chapter", async () => {
    const onChapterChange = vi.fn();
    render(
      <MemoryRouter>
        <TopBar
          bookSlug="x"
          chapters={chapters}
          currentN={1}
          editorModel="ed"
          reviewerModel="rv"
          modelOptions={["ed", "rv"]}
          onEditorModelChange={() => {}}
          onReviewerModelChange={() => {}}
          onChapterChange={onChapterChange}
        />
      </MemoryRouter>
    );
    await userEvent.selectOptions(screen.getByLabelText(/chapter/i), "2");
    expect(onChapterChange).toHaveBeenCalledWith(2);
  });
});
