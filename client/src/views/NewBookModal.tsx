import { FormEvent, useState } from "react";
import type { IngestRequest } from "../api/books";
import { pickPath } from "../api/system";
import { DEFAULT_SOURCE, DEFAULT_TARGET, LANGUAGES } from "../lib/languages";

interface NewBookModalProps {
  onSubmit: (req: IngestRequest) => void;
  onCancel: () => void;
  error?: string | null;
}

const FileIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6H4zm8 0v6h6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
  </svg>
);

const FolderIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
    <path d="M2 5a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
  </svg>
);

export default function NewBookModal({ onSubmit, onCancel, error }: NewBookModalProps) {
  const [translated, setTranslated] = useState("");
  const [english, setEnglish] = useState("");
  const [from, setFrom] = useState(DEFAULT_SOURCE);
  const [to, setTo] = useState(DEFAULT_TARGET);
  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  function cleanPath(s: string): string {
    let v = s.trim();
    if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === "'" || v[0] === '"')) {
      v = v.slice(1, -1).trim();
    }
    return v;
  }

  async function handlePick(
    field: "translated" | "english",
    kind: "file" | "folder",
  ) {
    const id = `${field}-${kind}`;
    setPicking(id);
    setPickError(null);
    try {
      const { path } = await pickPath(kind);
      if (!path) return; // user cancelled
      if (field === "translated") setTranslated(path);
      else setEnglish(path);
    } catch (e) {
      setPickError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(null);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tr = cleanPath(translated);
    const en = cleanPath(english);
    if (!tr || !en) return;
    onSubmit({
      translated_path: tr,
      english_path: en,
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
        {pickError && (
          <p className="mb-3 rounded border border-red-300 bg-red-50 px-2 py-1 text-sm text-red-700">
            File picker: {pickError}
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label htmlFor="translated-path" className="text-sm font-medium">
              Translated path
            </label>
            <div className="mt-1 flex gap-1">
              <input
                id="translated-path"
                type="text"
                value={translated}
                onChange={(e) => setTranslated(e.target.value)}
                placeholder="/path/to/translated/book.docx OR folder"
                className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => handlePick("translated", "file")}
                disabled={picking !== null}
                title="Choose .docx file"
                aria-label="Choose translated .docx file"
                className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {FileIcon}
                <span>File</span>
              </button>
              <button
                type="button"
                onClick={() => handlePick("translated", "folder")}
                disabled={picking !== null}
                title="Choose folder of .docx chapters"
                aria-label="Choose translated folder"
                className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {FolderIcon}
                <span>Folder</span>
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="english-path" className="text-sm font-medium">
              English path
            </label>
            <div className="mt-1 flex gap-1">
              <input
                id="english-path"
                type="text"
                value={english}
                onChange={(e) => setEnglish(e.target.value)}
                placeholder="/path/to/english/book.docx OR folder"
                className="flex-1 rounded border border-gray-300 px-2 py-1 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => handlePick("english", "file")}
                disabled={picking !== null}
                title="Choose .docx file"
                aria-label="Choose English .docx file"
                className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {FileIcon}
                <span>File</span>
              </button>
              <button
                type="button"
                onClick={() => handlePick("english", "folder")}
                disabled={picking !== null}
                title="Choose folder of .docx chapters"
                aria-label="Choose English folder"
                className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {FolderIcon}
                <span>Folder</span>
              </button>
            </div>
          </div>
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
