import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { deleteBook, ingestBook, restoreBook } from "../api/books";
import { useBooks } from "../hooks/useBooks";
import NewBookModal from "./NewBookModal";

export default function BookListRoute() {
  const { slugs, refresh, loading, error } = useBooks();
  const [showModal, setShowModal] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const navigate = useNavigate();

  return (
    <div data-testid="book-list-route" className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Books</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            + New book
          </button>
          <a
            href="/help/index.html?ctx=books"
            target="_blank"
            rel="noreferrer"
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Help
          </a>
          <Link
            to="/settings"
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Settings
          </Link>
        </div>
      </header>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error.message}</p>}
      {removeError && <p className="mb-2 text-sm text-red-600">{removeError}</p>}

      {!loading && !error && slugs.length === 0 && (
        <p className="text-gray-500">No books yet. Click "+ New book" to ingest one.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {slugs.map((slug) => (
          <li key={slug} className="flex items-center gap-2 pr-2 hover:bg-gray-50">
            <Link to={`/book/${slug}`} className="flex-1 px-4 py-2 font-mono text-sm">
              {slug}
            </Link>
            <button
              type="button"
              aria-label={`Restore ${slug} to original`}
              onClick={async () => {
                // Edits are archived under each chapter, never deleted.
                if (!window.confirm(
                  `Restore "${slug}" to the original translation?\n\nEvery chapter ` +
                  `goes back to round 0. Existing rounds and finals are archived ` +
                  `(chapters/chNN/archive-N/), not deleted.`
                )) return;
                setRemoveError(null);
                try {
                  const out = await restoreBook(slug);
                  refresh();
                  window.alert(
                    `"${slug}" restored to the original translation.\n\n` +
                    `${out.files_archived} file(s) archived under chapters/chNN/archive-N/.`
                  );
                } catch (err) {
                  setRemoveError(err instanceof Error ? err.message : String(err));
                }
              }}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-white"
            >
              Restore original
            </button>
            <button
              type="button"
              aria-label={`Remove ${slug}`}
              onClick={async () => {
                // List-only removal: nothing on disk is touched.
                if (!window.confirm(
                  `Remove "${slug}" from this list?\n\nNothing is deleted — every ` +
                  `file (rounds, finals, sources) stays in ~/.translate/${slug}/.`
                )) return;
                setRemoveError(null);
                try {
                  await deleteBook(slug);
                  refresh();
                } catch (err) {
                  setRemoveError(err instanceof Error ? err.message : String(err));
                }
              }}
              className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-white"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {showModal && (
        <NewBookModal
          onCancel={() => { setShowModal(false); setIngestError(null); }}
          onSubmit={async (req) => {
            setIngestError(null);
            try {
              const out = await ingestBook(req);
              setShowModal(false);
              refresh();
              navigate(`/book/${out.slug}`);
            } catch (e) {
              setIngestError(e instanceof Error ? e.message : String(e));
            }
          }}
          error={ingestError}
        />
      )}
    </div>
  );
}
