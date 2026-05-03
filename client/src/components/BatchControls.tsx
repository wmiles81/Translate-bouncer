import { useRef, useState } from "react";
import { runBatch, type BatchEvent } from "../lib/batchRunner";
import type { ChapterEntry } from "../types/api";

export interface BatchControlsProps {
  chapters: ChapterEntry[];
  currentN: number;
  bookSlug: string;
  editorModel: string;
  reviewerModel: string;
  disabled: boolean;
  onProgress: (ev: BatchEvent) => void;
  onBatchStart: () => void;
  onBatchEnd: () => void;
}

export default function BatchControls({
  chapters,
  currentN,
  bookSlug,
  editorModel,
  reviewerModel,
  disabled,
  onProgress,
  onBatchStart,
  onBatchEnd,
}: BatchControlsProps) {
  const total = chapters.length;
  const [fromN, setFromN] = useState(currentN);
  const [toN, setToN] = useState(total);
  const [skipDone, setSkipDone] = useState(true);
  const [rounds, setRounds] = useState(2);
  const [finalize, setFinalize] = useState(false);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const selected = chapters
    .filter((c) => c.n >= fromN && c.n <= toN)
    .filter((c) => !skipDone || c.status !== "done");

  async function handleRun() {
    if (selected.length === 0 || !editorModel || !reviewerModel) return;
    stopRef.current = false;
    setRunning(true);
    onBatchStart();
    try {
      await runBatch({
        bookSlug,
        chapters: selected,
        editorModel,
        reviewerModel,
        roundsPerChapter: rounds,
        finalize,
        shouldStop: () => stopRef.current,
        onProgress,
      });
    } finally {
      setRunning(false);
      onBatchEnd();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white px-4 py-2 text-sm">
      <span className="text-xs font-semibold uppercase text-gray-500">Batch</span>
      <label className="flex items-center gap-1">
        <span className="text-xs text-gray-600">From</span>
        <input
          type="number"
          min={1}
          max={total}
          value={fromN}
          disabled={running}
          onChange={(e) => setFromN(parseInt(e.target.value, 10) || 1)}
          className="w-16 rounded border border-gray-300 px-1 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1">
        <span className="text-xs text-gray-600">To</span>
        <input
          type="number"
          min={1}
          max={total}
          value={toN}
          disabled={running}
          onChange={(e) => setToN(parseInt(e.target.value, 10) || total)}
          className="w-16 rounded border border-gray-300 px-1 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={skipDone}
          disabled={running}
          onChange={(e) => setSkipDone(e.target.checked)}
        />
        Skip done
      </label>
      <label className="flex items-center gap-1">
        <span className="text-xs text-gray-600">Rounds</span>
        <input
          type="number"
          min={1}
          max={10}
          value={rounds}
          disabled={running}
          onChange={(e) => setRounds(parseInt(e.target.value, 10) || 1)}
          className="w-12 rounded border border-gray-300 px-1 py-0.5"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={finalize}
          disabled={running}
          onChange={(e) => setFinalize(e.target.checked)}
        />
        Finalize each
      </label>
      <span className="text-xs text-gray-500">
        {selected.length} chapter{selected.length === 1 ? "" : "s"} × {rounds}
      </span>
      {running ? (
        <button
          type="button"
          onClick={() => (stopRef.current = true)}
          className="ml-auto rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 hover:bg-amber-100"
        >
          Stop after current chapter
        </button>
      ) : (
        <button
          type="button"
          onClick={handleRun}
          disabled={
            disabled || selected.length === 0 || !editorModel || !reviewerModel
          }
          className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          Run batch
        </button>
      )}
    </div>
  );
}
