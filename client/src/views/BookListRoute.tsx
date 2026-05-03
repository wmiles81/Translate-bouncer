import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ingestBook } from "../api/books";
import { useBooks } from "../hooks/useBooks";
import NewBookModal from "./NewBookModal";

export default function BookListRoute() {
  const { slugs, refresh, loading, error } = useBooks();
  const [showModal, setShowModal] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
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

      {!loading && !error && slugs.length === 0 && (
        <p className="text-gray-500">No books yet. Click "+ New book" to ingest one.</p>
      )}

      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {slugs.map((slug) => (
          <li key={slug}>
            <Link
              to={`/book/${slug}`}
              className="block px-4 py-2 font-mono text-sm hover:bg-gray-50"
            >
              {slug}
            </Link>
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
