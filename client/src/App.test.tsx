import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BookListRoute from "./views/BookListRoute";
import BookViewRoute from "./views/BookViewRoute";
import ChapterRoute from "./views/ChapterRoute";
import SettingsRoute from "./views/SettingsRoute";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<BookListRoute />} />
        <Route path="/book/:slug" element={<BookViewRoute />} />
        <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("App routes", () => {
  it("renders BookListRoute at /", () => {
    renderAt("/");
    expect(screen.getByTestId("book-list-route")).toBeInTheDocument();
  });

  it("renders BookViewRoute at /book/:slug", () => {
    renderAt("/book/my-book");
    expect(screen.getByTestId("book-view-route")).toBeInTheDocument();
  });

  it("renders ChapterRoute at /book/:slug/chapter/:n", () => {
    renderAt("/book/my-book/chapter/2");
    expect(screen.getByTestId("chapter-route")).toBeInTheDocument();
  });

  it("renders SettingsRoute at /settings", () => {
    renderAt("/settings");
    expect(screen.getByTestId("settings-route")).toBeInTheDocument();
  });
});
