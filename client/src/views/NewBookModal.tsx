import { FormEvent, useState } from "react";
import type { IngestRequest } from "../api/books";
import { DEFAULT_SOURCE, DEFAULT_TARGET, LANGUAGES } from "../lib/languages";

interface NewBookModalProps {
  onSubmit: (req: IngestRequest) => void;
  onCancel: () => void;
  error?: string | null;
}

export default function NewBookModal({ onSubmit, onCancel, error }: NewBookModalProps) {
  const [translated, setTranslated] = useState("");
  const [english, setEnglish] = useState("");
  const [from, setFrom] = useState(DEFAULT_SOURCE);
  const [to, setTo] = useState(DEFAULT_TARGET);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!translated.trim() || !english.trim()) return;
    onSubmit({
      translated_path: translated.trim(),
      english_path: english.trim(),
      language_pair: { from, to },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded bg-white p-6 shadow-lg"
      >
        <h2 className="mb-4 text-lg font-semibold">New book</h2>
        {error && (
          <p className="mb-3 rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm font-medium">Translated path</span>
            <input
              type="text"
              value={translated}
              onChange={(e) => setTranslated(e.target.value)}
              placeholder="/path/to/translated/book.docx OR folder"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">English path</span>
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder="/path/to/english/book.docx OR folder"
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium">Source language</span>
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Target language</span>
              <select
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ingest
          </button>
        </div>
      </form>
    </div>
  );
}
