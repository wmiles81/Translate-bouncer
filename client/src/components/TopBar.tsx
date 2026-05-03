import { Link } from "react-router-dom";
import type { ChapterEntry, Model } from "../types/api";
import ModelPicker from "./ModelPicker";

interface Props {
  bookSlug: string;
  chapters: ChapterEntry[];
  currentN: number;
  editorModel: string;
  reviewerModel: string;
  models: Model[];
  onEditorModelChange: (v: string) => void;
  onReviewerModelChange: (v: string) => void;
  onChapterChange: (n: number) => void;
  onBatchRun?: () => void;
}

export default function TopBar({
  bookSlug,
  chapters,
  currentN,
  editorModel,
  reviewerModel,
  models,
  onEditorModelChange,
  onReviewerModelChange,
  onChapterChange,
  onBatchRun,
}: Props) {
  return (
    <header className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-2">
      <Link to={`/book/${bookSlug}`} className="text-sm text-blue-600 hover:underline">
        ← Book
      </Link>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Chapter</span>
        <select
          value={currentN}
          onChange={(e) => onChapterChange(parseInt(e.target.value, 10))}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {chapters.map((c) => (
            <option key={c.n} value={c.n}>
              Ch {String(c.n).padStart(2, "0")} / {chapters.length}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-4">
        <ModelPicker label="Editor" value={editorModel} models={models} onChange={onEditorModelChange} />
        <ModelPicker label="Reviewer" value={reviewerModel} models={models} onChange={onReviewerModelChange} />
        {onBatchRun && (
          <button
            type="button"
            onClick={onBatchRun}
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
          >
            ⏵ Batch run
          </button>
        )}
        <Link to="/settings" className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50">
          ⚙ Settings
        </Link>
      </div>
    </header>
  );
}
