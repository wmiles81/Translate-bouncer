import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { finalizeAllChapters } from "../api/books";
import ChapterListItem from "../components/ChapterListItem";
import { useHelp } from "../components/HelpDrawer";
import { useBook } from "../hooks/useBook";
import BatchRunModal from "./BatchRunModal";

export default function BookViewRoute() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { meta, loading, error, refresh } = useBook(slug);
  const [batchOpen, setBatchOpen] = useState(false);
  const help = useHelp();

  return (
    <div data-testid="book-view-route" className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          ← Books
        </Link>
        <div className="flex gap-2">
          {meta && (
            <>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm(
                  "Finalize every chapter that has at least one completed round?\n\n" +
                  "Each gets a final.docx and is marked done. Chapters with no rounds are skipped."
                )) return;
                try {
                  const out = await finalizeAllChapters(slug);
                  refresh();
                  window.alert(
                    `Finalized ${out.finalized.length} chapter(s).` +
                    (out.skipped.length ? `\nSkipped ${out.skipped.length} with no rounds yet.` : "")
                  );
                } catch (err) {
                  window.alert(err instanceof Error ? err.message : String(err));
                }
              }}
              className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
            >
              Finalize all
            </button>
            <button
              type="button"
              onClick={() => setBatchOpen(true)}
              className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
            >
              Batch run…
            </button>
            </>
          )}
          <button
            type="button"
            onClick={() => help.open("batch")}
            title="Help"
            aria-label="Help"
            className="rounded border border-gray-300 px-2 py-1 text-sm leading-none hover:bg-gray-50"
          >
            ❓
          </button>
          <Link
            to="/settings"
            title="Settings"
            aria-label="Settings"
            className="rounded border border-gray-300 px-2 py-1 text-sm leading-none hover:bg-gray-50"
          >
            ⚙️
          </Link>
        </div>
      </header>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error.message}</p>}

      {meta && (
        <>
          <h1 className="text-xl font-semibold">{meta.slug}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {meta.language_pair.from} → {meta.language_pair.to} · {meta.chapters.length} chapters
          </p>
          <dl className="mt-3 space-y-1 text-xs text-gray-500">
            <div>
              <dt className="inline font-medium">English: </dt>
              <dd className="inline font-mono">{meta.sources.english.path}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Translated: </dt>
              <dd className="inline font-mono">{meta.sources.translated.path}</dd>
            </div>
          </dl>

          <ul className="mt-6 rounded border border-gray-200">
            {meta.chapters.map((c) => (
              <ChapterListItem key={c.n} bookSlug={meta.slug} chapter={c} />
            ))}
          </ul>

          {batchOpen && (
            <BatchRunModal
              book={meta}
              onClose={() => setBatchOpen(false)}
              onCompleted={refresh}
            />
          )}
        </>
      )}
    </div>
  );
}
