import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

/** Which screen asked for help; maps to a topic via help/manifest.json contextMap. */
export type HelpContext = "books" | "chapter" | "batch" | "settings";

interface HelpApi {
  open: (ctx: HelpContext) => void;
  close: () => void;
}

const HelpCtx = createContext<HelpApi>({ open: () => {}, close: () => {} });

/** `const help = useHelp(); help.open("settings")` from any view. */
export function useHelp(): HelpApi {
  return useContext(HelpCtx);
}

const WIDE_KEY = "translate-help-wide";

// Storage is best-effort: private-mode browsers (and our test environment)
// expose no localStorage, and the drawer must still open.
function readWide(): boolean {
  try {
    return globalThis.localStorage?.getItem(WIDE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeWide(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(WIDE_KEY, value ? "1" : "0");
  } catch {
    /* not persisted; the drawer still works this session */
  }
}

/**
 * Hosts the help handbook in a right-hand drawer.
 *
 * The handbook itself is the static site the app already serves at
 * /help/index.html — reused wholesale in an iframe, so its search, navigation
 * and splitter keep working. Opening it in a browser tab (the previous
 * behaviour) stranded people with no way back to their book.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<HelpContext | null>(null);
  const [wide, setWide] = useState<boolean>(readWide);

  const open = useCallback((next: HelpContext) => setCtx(next), []);
  const close = useCallback(() => setCtx(null), []);

  useEffect(() => {
    if (!ctx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ctx, close]);

  const toggleWide = () => {
    setWide((w) => {
      writeWide(!w);
      return !w;
    });
  };

  return (
    <HelpCtx.Provider value={{ open, close }}>
      {children}
      <aside
        data-testid="help-drawer"
        data-wide={wide ? "1" : "0"}
        aria-label="Help"
        aria-hidden={!ctx}
        className={`fixed inset-y-0 right-0 z-50 flex flex-col border-l border-gray-300 bg-white shadow-2xl transition-transform duration-200 ${
          ctx ? "translate-x-0" : "pointer-events-none translate-x-full"
        }`}
        style={{ width: wide ? "min(1100px, 96vw)" : "min(560px, 94vw)" }}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <span className="text-sm font-semibold">Translate Help</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={toggleWide}
              aria-label={wide ? "Narrow help" : "Widen help"}
              title={wide ? "Narrow" : "Widen"}
              className="rounded border border-gray-300 px-2 py-0.5 text-sm hover:bg-gray-50"
            >
              {wide ? "⇥" : "⇤"}
            </button>
            <a
              href={ctx ? `/help/index.html?ctx=${ctx}` : "/help/index.html"}
              target="_blank"
              rel="noreferrer"
              title="Open in a new tab"
              aria-label="Open help in a new tab"
              className="rounded border border-gray-300 px-2 py-0.5 text-sm hover:bg-gray-50"
            >
              ↗
            </a>
            <button
              type="button"
              onClick={close}
              aria-label="Close help"
              title="Close (Esc)"
              className="rounded border border-gray-300 px-2 py-0.5 text-sm hover:bg-gray-50"
            >
              ✕
            </button>
          </div>
        </header>
        {/* Mounted only once opened, and re-keyed per context so the drawer
            lands on the topic for the screen you asked from. */}
        {ctx && (
          <iframe
            key={ctx}
            src={`/help/index.html?ctx=${ctx}`}
            title="Translate help"
            className="h-full w-full flex-1 border-0"
          />
        )}
      </aside>
    </HelpCtx.Provider>
  );
}
