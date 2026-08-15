import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  /** Persist the layout under this key; omit for a session-only layout. */
  storageKey?: string;
  /** Smallest share any column may shrink to, as a fraction of the row. */
  minFraction?: number;
  children: ReactNode[];
}

function read(key: string | undefined, count: number): number[] {
  const even = Array(count).fill(1 / count);
  if (!key) return even;
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return even;
    const parsed = JSON.parse(raw) as number[];
    if (!Array.isArray(parsed) || parsed.length !== count) return even;
    if (parsed.some((n) => typeof n !== "number" || !(n > 0))) return even;
    const total = parsed.reduce((a, b) => a + b, 0);
    return parsed.map((n) => n / total);
  } catch {
    return even;
  }
}

function write(key: string | undefined, cols: number[]): void {
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(cols));
  } catch {
    /* session-only; not worth surfacing */
  }
}

/**
 * A row of columns the reader can resize by dragging the seams between them.
 *
 * Panes hold a source text, its translation, and the reviewer's notes — how
 * much room each deserves depends on the chapter and the person, so it is not
 * ours to fix at a third each.
 */
export default function ResizableColumns({ storageKey, minFraction = 0.12, children }: Props) {
  const panes = children.length;
  const [cols, setCols] = useState<number[]>(() => read(storageKey, panes));
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ seam: number; startX: number; startCols: number[] } | null>(null);

  // Move `delta` (a fraction of the row) from the pane right of the seam to
  // the pane left of it, honouring the minimum on both sides.
  const applyDelta = useCallback(
    (seam: number, delta: number, from: number[]) => {
      const next = [...from];
      const left = from[seam];
      const right = from[seam + 1];
      const clamped = Math.max(minFraction - left, Math.min(right - minFraction, delta));
      next[seam] = left + clamped;
      next[seam + 1] = right - clamped;
      return next;
    },
    [minFraction],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      const width = rowRef.current?.getBoundingClientRect().width ?? 0;
      if (!d || width <= 0) return;
      setCols(applyDelta(d.seam, (e.clientX - d.startX) / width, d.startCols));
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      setCols((c) => {
        write(storageKey, c);
        return c;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [applyDelta, storageKey]);

  const nudge = (seam: number, delta: number) => {
    setCols((c) => {
      const next = applyDelta(seam, delta, c);
      write(storageKey, next);
      return next;
    });
  };

  return (
    <div
      ref={rowRef}
      data-testid="resizable-columns"
      className="grid overflow-hidden"
      style={{
        gridTemplateColumns: cols
          .map((c, i) => (i < panes - 1 ? `${c}fr 6px` : `${c}fr`))
          .join(" "),
      }}
    >
      {children.map((child, i) => (
        <div key={i} className="contents">
          <div className="min-w-0 overflow-hidden">{child}</div>
          {i < panes - 1 && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize panel ${i + 1}`}
              tabIndex={0}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = { seam: i, startX: e.clientX, startCols: cols };
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") nudge(i, e.shiftKey ? -0.1 : -0.02);
                else if (e.key === "ArrowRight") nudge(i, e.shiftKey ? 0.1 : 0.02);
                else return;
                e.preventDefault();
              }}
              className="cursor-col-resize bg-gray-200 transition-colors hover:bg-blue-400 focus:bg-blue-500 focus:outline-none"
              title="Drag to resize (arrow keys also work)"
            />
          )}
        </div>
      ))}
    </div>
  );
}
