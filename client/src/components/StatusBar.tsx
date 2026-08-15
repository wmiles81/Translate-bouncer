import { useEffect, useRef } from "react";

export interface ActivityEntry {
  id: number;
  ts: number;
  text: string;
  kind: "status" | "complete" | "error";
}

interface StatusBarProps {
  activity: ActivityEntry[];
  /** Live model output streamed during the active round (rolling tail). */
  stream?: string;
  busy: boolean;
  elapsed: number;
  canFinalize: boolean;
  onContinue: () => void;
  onDone: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function StatusBar({
  activity,
  stream,
  busy,
  elapsed,
  canFinalize,
  onContinue,
  onDone,
}: StatusBarProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity]);

  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [stream]);

  const last = activity[activity.length - 1];
  const lastText = last ? last.text : "Idle";

  return (
    <div className="border-t border-gray-200 bg-gray-50">
      {/* Three lines, always scrollable: the log is a running commentary, not a
          panel that should push the panes around as it grows. */}
      <div
        ref={logRef}
        className="h-[3.6rem] overflow-y-auto border-b border-gray-200 px-4 py-1 font-mono text-xs leading-[1.1rem]"
      >
        {activity.length === 0 ? (
          <div className="text-gray-400">No activity yet.</div>
        ) : (
          activity.map((e) => (
            <div
              key={e.id}
              className={
                e.kind === "error"
                  ? "text-red-600"
                  : e.kind === "complete"
                    ? "text-green-700"
                    : "text-gray-700"
              }
            >
              <span className="text-gray-400">{formatTime(e.ts)}</span>{" "}
              {e.text}
            </div>
          ))
        )}
      </div>
      {stream ? (
        <div
          ref={streamRef}
          data-testid="stream-preview"
          className="max-h-24 overflow-y-auto whitespace-pre-wrap border-b border-gray-200 bg-white px-4 py-1 font-mono text-xs text-gray-500"
        >
          {stream}
          <span className="animate-pulse">▌</span>
        </div>
      ) : null}
      <div className="flex items-center justify-between px-4 py-2">
        <span className="truncate text-sm text-gray-700">
          {busy && elapsed > 0 ? `${lastText} (${elapsed}s)` : lastText}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={onDone}
            disabled={!canFinalize || busy}
            className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
