import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HelpProvider } from "./components/HelpDrawer";
import BookListRoute from "./views/BookListRoute";
import BookViewRoute from "./views/BookViewRoute";
import ChapterRoute from "./views/ChapterRoute";
import SettingsRoute from "./views/SettingsRoute";

export default function App() {
  return (
    <BrowserRouter>
      <HelpProvider>
        <Routes>
          <Route path="/" element={<BookListRoute />} />
          <Route path="/book/:slug" element={<BookViewRoute />} />
          <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
        </Routes>
      </HelpProvider>
    </BrowserRouter>
  );
}
