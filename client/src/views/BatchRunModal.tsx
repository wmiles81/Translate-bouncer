import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ModelPicker from "../components/ModelPicker";
import type { ActivityEntry } from "../components/StatusBar";
import { useEvents } from "../hooks/useEvents";
import { useModels } from "../hooks/useModels";
import { useSettings } from "../hooks/useSettings";
import { runBatch, type BatchEvent } from "../lib/batchRunner";
import type { BookMeta, ChapterEntry } from "../types/api";

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

interface Props {
  book: BookMeta;
  onClose: () => void;
  onCompleted: () => void; // refresh book state after run
}

export default function BatchRunModal({ book, onClose, onCompleted }: Props) {
  const { models } = useModels();
  const { settings } = useSettings();

  const total = book.chapters.length;
  const [fromN, setFromN] = useState(1);
  const [toN, setToN] = useState(total);
  const [skipDone, setSkipDone] = useState(true);
  const [editorModel, setEditorModel] = useState(settings?.default_models.editor ?? "");
  const [reviewerModel, setReviewerModel] = useState(settings?.default_models.reviewer ?? "");

  // The pickers are per-run OVERRIDES of the Settings defaults. Settings load
  // async, so backfill once they arrive (unless the user already chose).
  useEffect(() => {
    if (!settings) return;
    setEditorModel((m) => m || settings.default_models.editor);
    setReviewerModel((m) => m || settings.default_models.reviewer);
  }, [settings]);
  const [rounds, setRounds] = useState(2);
  const [finalize, setFinalize] = useState(false);

  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<BatchEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [summary, setSummary] = useState<{ completed: number; errors: number; stopped: boolean } | null>(null);
  const stopRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const appendActivity = useCallback((text: string, kind: ActivityEntry["kind"]) => {
    setActivity((prev) => {
      const next: ActivityEntry = {
        id: prev.length > 0 ? prev[prev.length - 1].id + 1 : 1,
        ts: Date.now(),
        text,
        kind,
      };
      const out = [...prev, next];
      return out.length > 200 ? out.slice(out.length - 200) : out;
    });
  }, []);

  // Subscribe to server SSE so we get the same per-call activity stream the
  // chapter workspace shows. We keep the modal-level batch progress events
  // separate from these per-call detail events.
  useEvents(
    useCallback((e) => {
      if (e.type === "status") appendActivity(e.text, "status");
      else if (e.type === "round_complete")
        appendActivity(
          `✓ Ch ${e.chapter ?? "?"} R${e.round} ${e.stage} complete`,
          "complete",
        );
      else if (e.type === "error") appendActivity(`⚠ ${e.text}`, "error");
    }, [appendActivity]),
  );

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity]);

  function selectedChapters(): ChapterEntry[] {
    let chs = book.chapters.filter((c) => c.n >= fromN && c.n <= toN);
    if (skipDone) chs = chs.filter((c) => c.status !== "done");
    return chs;
  }

  async function handleRun(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editorModel || !reviewerModel) return;
    const chs = selectedChapters();
    if (chs.length === 0) return;
    stopRef.current = false;
    abortRef.current = new AbortController();
    setEvents([]);
    setActivity([]);
    setSummary(null);
    setRunning(true);
    try {
      const result = await runBatch({
        bookSlug: book.slug,
        chapters: chs,
        editorModel,
        reviewerModel,
        roundsPerChapter: rounds,
        finalize,
        shouldStop: () => stopRef.current,
        signal: abortRef.current.signal,
        onProgress: (ev) => setEvents((prev) => [...prev, ev]),
      });
      setSummary(result);
    } finally {
      setRunning(false);
      onCompleted();
    }
  }

  // Pull a friendly current-status line from the most recent event.
  const lastEvent = events[events.length - 1];
  let statusLine = "Ready.";
  if (running && lastEvent) {
    if (lastEvent.type === "chapter_start") {
      statusLine = `Chapter ${lastEvent.chapterIndex}/${lastEvent.totalChapters}: ${lastEvent.chapterTitle}`;
    } else if (lastEvent.type === "round_start") {
      const stage = lastEvent.stage === "finalize" ? "finalizing" : `calling ${lastEvent.stage}`;
      const round = lastEvent.roundN ? `round ${lastEvent.roundN}/${lastEvent.totalRounds} — ` : "";
      statusLine = `Ch ${lastEvent.chapterN}: ${round}${stage}…`;
    } else if (lastEvent.type === "round_done") {
      statusLine = `Ch ${lastEvent.chapterN}: round ${lastEvent.roundN} complete`;
    } else if (lastEvent.type === "chapter_done") {
      statusLine = `Ch ${lastEvent.chapterN}: chapter complete`;
    } else if (lastEvent.type === "error") {
      statusLine = `Ch ${lastEvent.chapterN}: error — ${lastEvent.error}`;
    }
  }

  const errors = events.filter((e) => e.type === "error");
  const completed = events.filter((e) => e.type === "chapter_done").length;
  const willRun = selectedChapters();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded bg-white shadow-lg">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
          <h2 className="text-lg font-semibold">Batch run</h2>
          <div className="flex gap-2">
            {running && (
              <button
                type="button"
                onClick={() => (stopRef.current = true)}
                className="rounded border border-gray-300 px-2 py-0.5 text-sm hover:bg-gray-50"
              >
                Stop after current chapter
              </button>
            )}
            {running ? (
              <button
                type="button"
                onClick={() => {
                  // Abandon the in-flight round: the server cancels the agent
                  // turn on disconnect; the chapter stays at its last saved round.
                  stopRef.current = true;
                  abortRef.current?.abort();
                }}
                className="rounded border border-red-300 px-2 py-0.5 text-sm text-red-700 hover:bg-red-50"
              >
                Stop now
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-gray-300 px-2 py-0.5 text-sm hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>
        </header>

        {!running && !summary && (
          <form onSubmit={handleRun} className="space-y-4 p-4 text-sm">
            <div className="flex items-end gap-3">
              <label>
                <span className="block text-xs font-medium text-gray-600">From chapter</span>
                <input
                  type="number"
                  min={1}
                  max={total}
                  value={fromN}
                  onChange={(e) => setFromN(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-20 rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label>
                <span className="block text-xs font-medium text-gray-600">To chapter</span>
                <input
                  type="number"
                  min={1}
                  max={total}
                  value={toN}
                  onChange={(e) => setToN(parseInt(e.target.value, 10) || total)}
                  className="mt-1 w-20 rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="ml-2 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={skipDone}
                  onChange={(e) => setSkipDone(e.target.checked)}
                />
                Skip done chapters
              </label>
            </div>

            {/* One picker per row: provider select + model dropdown don't fit two-up. */}
            <div className="flex flex-col gap-2">
              <ModelPicker
                label="Editor"
                value={editorModel}
                models={models}
                onChange={setEditorModel}
              />
              <ModelPicker
                label="Reviewer"
                value={reviewerModel}
                models={models}
                onChange={setReviewerModel}
              />
            </div>

            <div className="flex items-center gap-4">
              <label>
                <span className="block text-xs font-medium text-gray-600">Rounds per chapter</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rounds}
                  onChange={(e) => setRounds(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-20 rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={finalize}
                  onChange={(e) => setFinalize(e.target.checked)}
                />
                Finalize each chapter when done
              </label>
            </div>

            <p className="text-xs text-gray-500">
              Will process <strong>{willRun.length}</strong> chapter{willRun.length === 1 ? "" : "s"}
              {willRun.length > 0 && (
                <>
                  {" "}
                  ({willRun[0].n}–{willRun[willRun.length - 1].n})
                </>
              )}{" "}
              × {rounds} round{rounds === 1 ? "" : "s"} each.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={willRun.length === 0 || !editorModel || !reviewerModel}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                Run
              </button>
            </div>
          </form>
        )}

        {(running || summary) && (
          <div className="flex flex-1 flex-col overflow-hidden p-4 text-sm">
            <p className="mb-2 text-base">{statusLine}</p>
            <p className="mb-2 text-xs text-gray-500">
              Completed: <strong>{completed}</strong> · Errors: <strong>{errors.length}</strong>
              {summary && summary.stopped && <> · stopped by user</>}
            </p>

            <div
              ref={logRef}
              className="mb-3 flex-1 min-h-0 overflow-y-auto rounded border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs"
            >
              {activity.length === 0 ? (
                <div className="text-gray-400">Waiting for activity…</div>
              ) : (
                activity.map((ev) => (
                  <div
                    key={ev.id}
                    className={
                      ev.kind === "error"
                        ? "text-red-600"
                        : ev.kind === "complete"
                          ? "text-green-700"
                          : "text-gray-700"
                    }
                  >
                    <span className="text-gray-400">{formatTime(ev.ts)}</span> {ev.text}
                  </div>
                ))
              )}
            </div>

            {errors.length > 0 && (
              <details className="mt-3 rounded border border-red-200 bg-red-50 p-2">
                <summary className="cursor-pointer text-sm font-medium text-red-700">
                  {errors.length} error{errors.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {errors.map((e, i) => (
                    <li key={i}>
                      Ch {e.chapterN}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {summary && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
