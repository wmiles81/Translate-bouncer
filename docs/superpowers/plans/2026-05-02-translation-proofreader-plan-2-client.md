# Translation Proofreader — Plan 2: Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React + Vite + TypeScript browser client that consumes the Plan 1 server's HTTP API, providing the workspace UI from spec §4 (book view + 3-pane chapter workspace + diff toggle + status bar) and the settings UI from spec §6 (API key, default models, prompts with version history, ingestion patterns).

**Architecture:** A single-page app served from `/` by the Python server in production, or by Vite's dev server with a proxy in development. Plain React state + React Router; native `fetch` + `EventSource`; Tailwind CSS for styling. Each view is a route; each component is small and focused. Server is the source of truth — every action round-trips to the server, and live progress comes back over SSE.

**Tech Stack:** React 18 · TypeScript · Vite · React Router v6 · Tailwind CSS v3 · native fetch + EventSource · jsdiff · Vitest + @testing-library/react + happy-dom

**Spec reference:** [docs/superpowers/specs/2026-05-02-translation-proofreader-design_v2.md](../specs/2026-05-02-translation-proofreader-design_v2.md)

**Server API contract:** see [README.md](../../../README.md) §API surface. Plan 2 makes no server-side API changes; the only server change in this plan is mounting `client/dist/` as static files in production (Phase 2).

---

## Conventions used in this plan

- All paths are repo-relative unless they begin with `~/` or `/`.
- `client/` is the new top-level directory containing the React app.
- "Run" lines show the command to execute. "Expected" lines show what success looks like.
- "Commit" steps batch the listed files into one commit with the shown message.
- Test files live alongside the code they test, named `<file>.test.ts(x)`.
- All component code uses TypeScript. Strict mode on.
- Tailwind utility classes only — no custom CSS unless explicitly noted.

---

## File structure (target)

```
client/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── src/
│   ├── main.tsx                    # React root
│   ├── App.tsx                     # router setup
│   ├── index.css                   # tailwind directives
│   ├── api/
│   │   ├── client.ts               # typed fetch wrapper
│   │   ├── books.ts                # /books endpoints
│   │   ├── chapters.ts             # /books/:slug/chapter/:n endpoints
│   │   ├── prompts.ts              # /prompts endpoints
│   │   ├── settings.ts             # /settings, /models endpoints
│   │   └── events.ts               # /events SSE subscription
│   ├── types/
│   │   └── api.ts                  # mirrors server Pydantic models
│   ├── hooks/
│   │   ├── useEvents.ts            # SSE subscription
│   │   ├── useBooks.ts             # list books + ingest
│   │   ├── useBook.ts              # one book's state
│   │   ├── useChapter.ts           # one chapter's state + round actions
│   │   ├── useSettings.ts          # GET/PUT /settings
│   │   ├── useModels.ts            # GET /models (cached)
│   │   └── usePrompts.ts           # /prompts CRUD
│   ├── views/
│   │   ├── BookListRoute.tsx       # / — pick a book
│   │   ├── BookViewRoute.tsx       # /book/:slug — chapter list
│   │   ├── ChapterRoute.tsx        # /book/:slug/chapter/:n — workspace
│   │   ├── SettingsRoute.tsx       # /settings
│   │   └── NewBookModal.tsx        # ingest form (overlay)
│   ├── components/
│   │   ├── TopBar.tsx              # chapter selector + model dropdowns + settings link
│   │   ├── StatusBar.tsx           # SSE-driven status text + Continue/Done buttons
│   │   ├── EnglishPane.tsx         # left pane, read-only
│   │   ├── WorkingPane.tsx         # middle pane, with diff toggle
│   │   ├── SuggestionsPane.tsx     # right pane, collapsible
│   │   ├── DiffView.tsx            # paragraph-level red/green diff
│   │   ├── ModelPicker.tsx         # dropdown with refresh
│   │   ├── PromptEditor.tsx        # textarea + version history
│   │   ├── ChapterListItem.tsx     # one row in book view
│   │   └── ParagraphRender.tsx     # renders italic/bold/headings inline
│   └── lib/
│       ├── markup.ts               # parse *italic* and **bold** markers
│       └── diff.ts                 # paragraph-level diff helper
└── tests/
    └── setup.ts                    # vitest setup (jest-dom, etc.)
```

Server change in this plan:

```
server/
└── main.py                         # Phase 2: mount client/dist/ as static files
```

---

## Phase 1 — Client Scaffolding

### Task 1.1: Initialize Vite + React + TypeScript project

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/tsconfig.node.json`
- Create: `client/vite.config.ts`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Modify: `.gitignore` (add `client/node_modules/` and `client/dist/`)

- [ ] **Step 1: Create the directory and `client/package.json`**

```json
{
  "name": "translate-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "diff": "^5.2.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/diff": "^5.2.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "happy-dom": "^14.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `client/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts", "tailwind.config.ts", "postcss.config.js"]
}
```

- [ ] **Step 4: Create `client/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/health":   "http://localhost:5180",
      "/settings": "http://localhost:5180",
      "/models":   "http://localhost:5180",
      "/prompts":  "http://localhost:5180",
      "/books":    "http://localhost:5180",
      "/events":   { target: "http://localhost:5180", changeOrigin: true, ws: false },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 5: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Translate</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `client/src/main.tsx`**

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Create `client/src/App.tsx` (placeholder)**

```typescript
export default function App() {
  return <div className="p-4">Translate</div>;
}
```

- [ ] **Step 8: Append to repo-root `.gitignore`**

Add these lines to `.gitignore` (at the bottom or in the Node section):

```
client/node_modules/
client/dist/
```

- [ ] **Step 9: Install dependencies**

```bash
cd client
npm install
```

Expected: installs without error.

- [ ] **Step 10: Commit**

```bash
cd ..
git add .gitignore client/package.json client/tsconfig.json client/tsconfig.node.json \
        client/vite.config.ts client/index.html client/src/main.tsx client/src/App.tsx \
        client/package-lock.json
git commit -m "chore(client): scaffold React + Vite + TypeScript project"
```

### Task 1.2: Configure Tailwind CSS

**Files:**
- Create: `client/tailwind.config.ts`
- Create: `client/postcss.config.js`
- Create: `client/src/index.css`
- Create: `client/tests/setup.ts`

- [ ] **Step 1: Create `client/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
        serif: ["Georgia", "ui-serif", "serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Create `client/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}
body {
  margin: 0;
}
```

- [ ] **Step 4: Create `client/tests/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Verify Tailwind compiles**

```bash
cd client
npm run build
```

Expected: `dist/` directory with `index.html` and bundled CSS/JS. The CSS file should contain Tailwind utilities.

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev -- --no-open &
sleep 3
curl -s http://localhost:5173/ | grep -q '<div id="root">' && echo OK || echo FAIL
kill %1
```

Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
cd ..
git add client/tailwind.config.ts client/postcss.config.js client/src/index.css client/tests/setup.ts
git commit -m "chore(client): configure Tailwind CSS and Vitest setup"
```

### Task 1.3: Smoke test — App renders

**Files:**
- Create: `client/src/App.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("Translate")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test**

```bash
cd client
npm test
```

Expected: `1 passed`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add client/src/App.test.tsx
git commit -m "test(client): add App smoke test"
```

---

## Phase 2 — Server Static-File Serving

### Task 2.1: Mount `client/dist/` on `/` in production

**Files:**
- Modify: `server/main.py`
- Test: `tests/server/test_static.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/server/test_static.py
from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from server.main import create_app


def test_root_serves_index_when_dist_exists(tmp_path: Path, monkeypatch) -> None:
    # Simulate a built client.
    dist = tmp_path / "client_dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>built</body></html>")
    monkeypatch.setenv("TRANSLATE_CLIENT_DIST", str(dist))

    client = TestClient(create_app())
    r = client.get("/")
    assert r.status_code == 200
    assert "built" in r.text


def test_root_returns_404_when_dist_missing(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TRANSLATE_CLIENT_DIST", str(tmp_path / "nope"))
    client = TestClient(create_app())
    r = client.get("/")
    # No client built; root has no handler.
    assert r.status_code == 404


def test_api_routes_still_work_when_dist_mounted(tmp_path: Path, monkeypatch) -> None:
    dist = tmp_path / "client_dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>built</body></html>")
    monkeypatch.setenv("TRANSLATE_CLIENT_DIST", str(dist))

    client = TestClient(create_app())
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test**

```bash
cd "/Volumes/Storage/Development/Software/General/untitled folder"
source .venv/bin/activate
pytest tests/server/test_static.py -v
```

Expected: 3 failures (the static mount doesn't exist yet).

- [ ] **Step 3: Modify `server/main.py`**

In `create_app()`, AFTER all the `app.include_router(...)` lines and BEFORE `return app`, add:

```python
    import os
    from pathlib import Path

    from fastapi.staticfiles import StaticFiles

    dist_env = os.environ.get("TRANSLATE_CLIENT_DIST")
    dist_path = Path(dist_env) if dist_env else Path(__file__).parent.parent / "client" / "dist"
    if dist_path.exists() and (dist_path / "index.html").exists():
        # Mount AFTER all API routes so they take precedence.
        app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="client")
```

- [ ] **Step 4: Run the test**

```bash
pytest tests/server/test_static.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Run full server suite**

```bash
pytest tests/server/ -v
```

Expected: all prior tests still pass + 3 new = 104 passed, 1 skipped.

- [ ] **Step 6: Commit**

```bash
git add server/main.py tests/server/test_static.py
git commit -m "feat(server): serve client/dist/ on / when present"
```

---

## Phase 3 — API Types

### Task 3.1: TypeScript types mirroring server Pydantic models

**Files:**
- Create: `client/src/types/api.ts`
- Create: `client/src/types/api.test.ts`

- [ ] **Step 1: Write `client/src/types/api.ts`**

```typescript
// Mirrors server/state.py (book + chapter meta) and server/rounds.py (Suggestion, ReviewerResult).

export type ChapterStatus = "untouched" | "in_progress" | "done";

export interface LanguagePair {
  from: string;
  to: string;
}

export interface SourceRef {
  path: string;
  format: "folder" | "single-docx";
}

export interface BookSources {
  translated: SourceRef;
  english: SourceRef;
}

export interface ChapterEntry {
  n: number;
  title: string;
  status: ChapterStatus;
}

export interface BookMeta {
  slug: string;
  created_at: string;
  sources: BookSources;
  language_pair: LanguagePair;
  chapters: ChapterEntry[];
}

export interface ModelsRef {
  editor: string;
  reviewer: string;
}

export interface PromptsUsed {
  editor_version: string | null;
  reviewer_version: string | null;
}

export interface RoundEntry {
  n: number;
  editor_completed_at: string | null;
  reviewer_completed_at: string | null;
}

export interface ChapterMeta {
  n: number;
  status: ChapterStatus;
  current_round: number;
  models: ModelsRef;
  prompts_used: PromptsUsed;
  rounds: RoundEntry[];
}

export interface Suggestion {
  id: number;
  quote: string;
  comment: string;
}

export interface ReviewerResult {
  round: number;
  model: string;
  completed_at: string;
  suggestions: Suggestion[];
  raw_response: string;
}

// /settings shape
export interface DefaultModels {
  editor: string;
  reviewer: string;
}
export interface IngestionConfig {
  heading_style: string;
  fallback_patterns: string[];
}
export interface Settings {
  openrouter_api_key: string;
  default_models: DefaultModels;
  ingestion: IngestionConfig;
}

// /prompts shape
export type PromptKind = "editor" | "reviewer";
export interface PromptVersion {
  id: string;
  saved_at: string;
  text: string;
}
export interface PromptFile {
  current: string;
  versions: PromptVersion[];
}

// SSE event shape (server side publishes objects with `type` plus extras)
export type AppEvent =
  | { type: "status"; text: string }
  | { type: "round_complete"; round: number; stage: "editor" | "reviewer" }
  | { type: "error"; text: string }
  | { type: "stop" };

// Parsed-doc shape used by panes (mirrors server/docx_io.py)
export type ParagraphStyle = "normal" | `heading-${1 | 2 | 3 | 4 | 5 | 6}`;
export interface ParsedParagraph {
  style: ParagraphStyle;
  text: string;
}
export interface ParsedDoc {
  paragraphs: ParsedParagraph[];
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// client/src/types/api.test.ts
import type {
  AppEvent,
  BookMeta,
  ChapterMeta,
  ChapterStatus,
  ParagraphStyle,
  Settings,
} from "./api";

describe("api types", () => {
  it("ChapterStatus accepts the three documented values", () => {
    const a: ChapterStatus = "untouched";
    const b: ChapterStatus = "in_progress";
    const c: ChapterStatus = "done";
    expect([a, b, c]).toEqual(["untouched", "in_progress", "done"]);
  });

  it("ParagraphStyle accepts heading-1..6 and normal", () => {
    const styles: ParagraphStyle[] = [
      "normal",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
    ];
    expect(styles.length).toBe(7);
  });

  it("BookMeta has language_pair with `from` (not `from_`)", () => {
    const bm: BookMeta = {
      slug: "x",
      created_at: "2026-05-02T00:00:00Z",
      sources: {
        translated: { path: "/a", format: "folder" },
        english: { path: "/b", format: "single-docx" },
      },
      language_pair: { from: "en", to: "fr" },
      chapters: [{ n: 1, title: "Ch 1", status: "untouched" }],
    };
    expect(bm.language_pair.from).toBe("en");
  });

  it("ChapterMeta starts with current_round=0 and untouched", () => {
    const cm: ChapterMeta = {
      n: 1,
      status: "untouched",
      current_round: 0,
      models: { editor: "", reviewer: "" },
      prompts_used: { editor_version: null, reviewer_version: null },
      rounds: [],
    };
    expect(cm.current_round).toBe(0);
  });

  it("AppEvent is a discriminated union", () => {
    const e1: AppEvent = { type: "status", text: "hi" };
    const e2: AppEvent = { type: "round_complete", round: 1, stage: "editor" };
    const e3: AppEvent = { type: "error", text: "boom" };
    const e4: AppEvent = { type: "stop" };
    expect([e1.type, e2.type, e3.type, e4.type]).toEqual(["status", "round_complete", "error", "stop"]);
  });

  it("Settings shape matches server", () => {
    const s: Settings = {
      openrouter_api_key: "",
      default_models: { editor: "", reviewer: "" },
      ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
    };
    expect(s.openrouter_api_key).toBe("");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/types/api.test.ts
```

Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/types/api.ts client/src/types/api.test.ts
git commit -m "feat(client): TypeScript API types mirroring server models"
```

---

## Phase 4 — API Client

### Task 4.1: Typed `fetch` wrapper

**Files:**
- Create: `client/src/api/client.ts`
- Create: `client/src/api/client.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// client/src/api/client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./client";

describe("request", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on 200", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ a: 1 }), { status: 200, headers: { "content-type": "application/json" } })
    );
    const out = await request<{ a: number }>("/x");
    expect(out).toEqual({ a: 1 });
  });

  it("throws ApiError with parsed detail on non-2xx", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "bad key" }), { status: 400 })
    );
    await expect(request("/x")).rejects.toThrow(ApiError);
    try {
      await request("/x");
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(400);
      expect((e as ApiError).detail).toBe("bad key");
    }
  });

  it("sends JSON body when provided", async () => {
    const fetchMock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 })
    );
    await request("/x", { method: "PUT", body: { a: 1 } });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd client
npm test src/api/client.test.ts
```

Expected: 3 failures (`request` not defined).

- [ ] **Step 3: Write `client/src/api/client.ts`**

```typescript
export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
}

export async function request<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };
  const r = await fetch(path, init);
  if (!r.ok) {
    let detail: unknown = await r.text();
    try {
      const parsed = JSON.parse(detail as string);
      detail = parsed?.detail ?? parsed;
    } catch {
      // leave as text
    }
    throw new ApiError(r.status, detail);
  }
  if (r.status === 204) return undefined as T;
  return (await r.json()) as T;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test src/api/client.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/api/client.ts client/src/api/client.test.ts
git commit -m "feat(client): typed fetch wrapper with ApiError"
```

### Task 4.2: Resource modules — settings, models, prompts

**Files:**
- Create: `client/src/api/settings.ts`
- Create: `client/src/api/prompts.ts`
- Create: `client/src/api/settings.test.ts`
- Create: `client/src/api/prompts.test.ts`

- [ ] **Step 1: Write `client/src/api/settings.ts`**

```typescript
import type { Settings } from "../types/api";
import { request } from "./client";

export const getSettings = () => request<Settings>("/settings");

export const putSettings = (cfg: Settings) =>
  request<Settings>("/settings", { method: "PUT", body: cfg });

export const getModels = () => request<string[]>("/models");
```

- [ ] **Step 2: Write `client/src/api/prompts.ts`**

```typescript
import type { PromptFile, PromptKind } from "../types/api";
import { request } from "./client";

export const getPrompts = (kind: PromptKind) => request<PromptFile>(`/prompts/${kind}`);

export const putPrompts = (kind: PromptKind, text: string) =>
  request<PromptFile>(`/prompts/${kind}`, { method: "PUT", body: { text } });

export const restorePrompt = (kind: PromptKind, versionId: string) =>
  request<PromptFile>(`/prompts/${kind}/restore/${versionId}`, { method: "POST" });

export const deletePromptVersion = (kind: PromptKind, versionId: string) =>
  request<PromptFile>(`/prompts/${kind}/${versionId}`, { method: "DELETE" });
```

- [ ] **Step 3: Write `client/src/api/settings.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getModels, getSettings, putSettings } from "./settings";

describe("settings api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getSettings calls GET /settings", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          openrouter_api_key: "x",
          default_models: { editor: "e", reviewer: "r" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
        }),
        { status: 200 }
      )
    );
    const s = await getSettings();
    expect(mock.mock.calls[0][0]).toBe("/settings");
    expect(s.openrouter_api_key).toBe("x");
  });

  it("putSettings calls PUT /settings with body", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          openrouter_api_key: "y",
          default_models: { editor: "", reviewer: "" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
        }),
        { status: 200 }
      )
    );
    await putSettings({
      openrouter_api_key: "y",
      default_models: { editor: "", reviewer: "" },
      ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
    });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/settings");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string).openrouter_api_key).toBe("y");
  });

  it("getModels calls GET /models", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(["a", "b"]), { status: 200 })
    );
    const ids = await getModels();
    expect(mock.mock.calls[0][0]).toBe("/models");
    expect(ids).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 4: Write `client/src/api/prompts.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deletePromptVersion, getPrompts, putPrompts, restorePrompt } from "./prompts";

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

describe("prompts api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getPrompts URL", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v1", versions: [] })
    );
    await getPrompts("editor");
    expect(mock.mock.calls[0][0]).toBe("/prompts/editor");
  });

  it("putPrompts URL+method+body", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v2", versions: [] })
    );
    await putPrompts("reviewer", "new text");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/prompts/reviewer");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ text: "new text" });
  });

  it("restorePrompt URL+method", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v3", versions: [] })
    );
    await restorePrompt("editor", "v1");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/prompts/editor/restore/v1");
    expect(init.method).toBe("POST");
  });

  it("deletePromptVersion URL+method", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ current: "v2", versions: [] })
    );
    await deletePromptVersion("editor", "v1");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/prompts/editor/v1");
    expect(init.method).toBe("DELETE");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd client
npm test src/api/settings.test.ts src/api/prompts.test.ts
```

Expected: 7 passed.

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/api/settings.ts client/src/api/prompts.ts \
        client/src/api/settings.test.ts client/src/api/prompts.test.ts
git commit -m "feat(client): API modules for settings, models, prompts"
```

### Task 4.3: Resource modules — books, chapters

**Files:**
- Create: `client/src/api/books.ts`
- Create: `client/src/api/chapters.ts`
- Create: `client/src/api/books.test.ts`
- Create: `client/src/api/chapters.test.ts`

- [ ] **Step 1: Write `client/src/api/books.ts`**

```typescript
import type { BookMeta, LanguagePair } from "../types/api";
import { request } from "./client";

export interface IngestRequest {
  translated_path: string;
  english_path: string;
  language_pair: LanguagePair;
  on_collision?: "resume" | "new-session";
}
export interface IngestResponse {
  slug: string;
}

export const listBooks = () => request<string[]>("/books");

export const ingestBook = (req: IngestRequest) =>
  request<IngestResponse>("/books", { method: "POST", body: req });

export const getBook = (slug: string) => request<BookMeta>(`/books/${slug}`);
```

- [ ] **Step 2: Write `client/src/api/chapters.ts`**

```typescript
import type { ChapterMeta, ReviewerResult } from "../types/api";
import { request } from "./client";

export const getChapterState = (slug: string, n: number) =>
  request<ChapterMeta>(`/books/${slug}/chapter/${n}/state`);

export const runEditorRound = (slug: string, n: number, model: string) =>
  request<ChapterMeta>(`/books/${slug}/chapter/${n}/round/editor`, {
    method: "POST",
    body: { model },
  });

export const runReviewerRound = (slug: string, n: number, model: string) =>
  request<ReviewerResult>(`/books/${slug}/chapter/${n}/round/reviewer`, {
    method: "POST",
    body: { model },
  });

export const finalizeChapter = (slug: string, n: number) =>
  request<ChapterMeta>(`/books/${slug}/chapter/${n}/finalize`, { method: "POST" });
```

- [ ] **Step 3: Write `client/src/api/books.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getBook, ingestBook, listBooks } from "./books";

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("books api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("listBooks calls GET /books", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson(["a", "b"])
    );
    const out = await listBooks();
    expect(mock.mock.calls[0][0]).toBe("/books");
    expect(out).toEqual(["a", "b"]);
  });

  it("ingestBook POSTs the request body", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ slug: "my-book" })
    );
    await ingestBook({
      translated_path: "/p/fr",
      english_path: "/p/en",
      language_pair: { from: "en", to: "fr" },
    });
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.translated_path).toBe("/p/fr");
    expect(body.language_pair).toEqual({ from: "en", to: "fr" });
  });

  it("ingestBook includes on_collision when provided", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({ slug: "x" })
    );
    await ingestBook({
      translated_path: "/p/fr",
      english_path: "/p/en",
      language_pair: { from: "en", to: "fr" },
      on_collision: "resume",
    });
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).on_collision).toBe("resume");
  });

  it("getBook calls GET /books/:slug", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        slug: "x",
        created_at: "2026-05-02T00:00:00Z",
        sources: {
          translated: { path: "/a", format: "folder" },
          english: { path: "/b", format: "folder" },
        },
        language_pair: { from: "en", to: "fr" },
        chapters: [],
      })
    );
    const bm = await getBook("x");
    expect(mock.mock.calls[0][0]).toBe("/books/x");
    expect(bm.slug).toBe("x");
  });
});
```

- [ ] **Step 4: Write `client/src/api/chapters.test.ts`**

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeChapter,
  getChapterState,
  runEditorRound,
  runReviewerRound,
} from "./chapters";

const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("chapters api", () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getChapterState URL", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "untouched",
        current_round: 0,
        models: { editor: "", reviewer: "" },
        prompts_used: { editor_version: null, reviewer_version: null },
        rounds: [],
      })
    );
    await getChapterState("le-livre", 2);
    expect(mock.mock.calls[0][0]).toBe("/books/le-livre/chapter/2/state");
  });

  it("runEditorRound POST with model", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "in_progress",
        current_round: 1,
        models: { editor: "m", reviewer: "" },
        prompts_used: { editor_version: "v1", reviewer_version: null },
        rounds: [],
      })
    );
    await runEditorRound("x", 1, "anthropic/claude-sonnet-4");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books/x/chapter/1/round/editor");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ model: "anthropic/claude-sonnet-4" });
  });

  it("runReviewerRound POST with model", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        round: 1,
        model: "openai/gpt-5",
        completed_at: "2026-05-02T00:00:00Z",
        suggestions: [],
        raw_response: "[]",
      })
    );
    await runReviewerRound("x", 1, "openai/gpt-5");
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books/x/chapter/1/round/reviewer");
    expect(init.method).toBe("POST");
  });

  it("finalizeChapter POST", async () => {
    const mock = (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      okJson({
        n: 1,
        status: "done",
        current_round: 1,
        models: { editor: "", reviewer: "" },
        prompts_used: { editor_version: null, reviewer_version: null },
        rounds: [],
      })
    );
    await finalizeChapter("x", 1);
    const [url, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/books/x/chapter/1/finalize");
    expect(init.method).toBe("POST");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd client
npm test src/api/books.test.ts src/api/chapters.test.ts
```

Expected: 8 passed.

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/api/books.ts client/src/api/chapters.ts \
        client/src/api/books.test.ts client/src/api/chapters.test.ts
git commit -m "feat(client): API modules for books and chapters"
```

---

## Phase 5 — Router + Base Layout

### Task 5.1: Wire React Router with placeholder routes

**Files:**
- Modify: `client/src/App.tsx`
- Create: `client/src/views/BookListRoute.tsx`
- Create: `client/src/views/BookViewRoute.tsx`
- Create: `client/src/views/ChapterRoute.tsx`
- Create: `client/src/views/SettingsRoute.tsx`
- Create: `client/src/App.test.tsx` (replaces Phase 1.3 smoke test)

- [ ] **Step 1: Replace `client/src/App.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BookListRoute from "./views/BookListRoute";
import BookViewRoute from "./views/BookViewRoute";
import ChapterRoute from "./views/ChapterRoute";
import SettingsRoute from "./views/SettingsRoute";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<BookListRoute />} />
        <Route path="/book/:slug" element={<BookViewRoute />} />
        <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("App routes", () => {
  it("renders BookListRoute at /", () => {
    renderAt("/");
    expect(screen.getByTestId("book-list-route")).toBeInTheDocument();
  });

  it("renders BookViewRoute at /book/:slug", () => {
    renderAt("/book/my-book");
    expect(screen.getByTestId("book-view-route")).toBeInTheDocument();
  });

  it("renders ChapterRoute at /book/:slug/chapter/:n", () => {
    renderAt("/book/my-book/chapter/2");
    expect(screen.getByTestId("chapter-route")).toBeInTheDocument();
  });

  it("renders SettingsRoute at /settings", () => {
    renderAt("/settings");
    expect(screen.getByTestId("settings-route")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Create the four placeholder views**

`client/src/views/BookListRoute.tsx`:

```typescript
export default function BookListRoute() {
  return <div data-testid="book-list-route">book list</div>;
}
```

`client/src/views/BookViewRoute.tsx`:

```typescript
export default function BookViewRoute() {
  return <div data-testid="book-view-route">book view</div>;
}
```

`client/src/views/ChapterRoute.tsx`:

```typescript
export default function ChapterRoute() {
  return <div data-testid="chapter-route">chapter workspace</div>;
}
```

`client/src/views/SettingsRoute.tsx`:

```typescript
export default function SettingsRoute() {
  return <div data-testid="settings-route">settings</div>;
}
```

- [ ] **Step 3: Replace `client/src/App.tsx`**

```typescript
import { BrowserRouter, Route, Routes } from "react-router-dom";
import BookListRoute from "./views/BookListRoute";
import BookViewRoute from "./views/BookViewRoute";
import ChapterRoute from "./views/ChapterRoute";
import SettingsRoute from "./views/SettingsRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<BookListRoute />} />
        <Route path="/book/:slug" element={<BookViewRoute />} />
        <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Run tests**

```bash
cd client
npm test src/App.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/App.tsx client/src/App.test.tsx \
        client/src/views/BookListRoute.tsx client/src/views/BookViewRoute.tsx \
        client/src/views/ChapterRoute.tsx client/src/views/SettingsRoute.tsx
git commit -m "feat(client): wire React Router with four placeholder routes"
```

---

## Phase 6 — SSE Event Hook + StatusBar

### Task 6.1: `useEvents` hook — subscribes to /events

**Files:**
- Create: `client/src/hooks/useEvents.ts`
- Create: `client/src/hooks/useEvents.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/hooks/useEvents.test.tsx
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent } from "../types/api";
import { useEvents } from "./useEvents";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  emit(payload: AppEvent) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(payload) }));
  }
  close() {
    this.closed = true;
  }
}

function Probe({ onEvent }: { onEvent: (e: AppEvent) => void }) {
  useEvents(onEvent);
  return null;
}

describe("useEvents", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
      FakeEventSource as unknown as typeof EventSource;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens an EventSource at /events on mount", () => {
    render(<Probe onEvent={() => {}} />);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe("/events");
  });

  it("calls handler with parsed event objects", () => {
    const seen: AppEvent[] = [];
    render(<Probe onEvent={(e) => seen.push(e)} />);
    act(() => {
      FakeEventSource.instances[0].emit({ type: "status", text: "hi" });
    });
    expect(seen).toEqual([{ type: "status", text: "hi" }]);
  });

  it("closes the connection on unmount", () => {
    const { unmount } = render(<Probe onEvent={() => {}} />);
    const es = FakeEventSource.instances[0];
    unmount();
    expect(es.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Write `client/src/hooks/useEvents.ts`**

```typescript
import { useEffect } from "react";
import type { AppEvent } from "../types/api";

export function useEvents(onEvent: (e: AppEvent) => void): void {
  useEffect(() => {
    const es = new EventSource("/events");
    es.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as AppEvent);
      } catch {
        // ignore malformed
      }
    };
    return () => {
      es.close();
    };
    // intentionally only on mount; handler is captured at mount time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/hooks/useEvents.test.tsx
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/hooks/useEvents.ts client/src/hooks/useEvents.test.tsx
git commit -m "feat(client): useEvents hook for SSE subscription"
```

### Task 6.2: StatusBar component

**Files:**
- Create: `client/src/components/StatusBar.tsx`
- Create: `client/src/components/StatusBar.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/components/StatusBar.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StatusBar from "./StatusBar";

describe("StatusBar", () => {
  it("renders idle by default", () => {
    render(<StatusBar status="Idle" busy={false} canFinalize={false} onContinue={() => {}} onDone={() => {}} />);
    expect(screen.getByText("Idle")).toBeInTheDocument();
  });

  it("disables Continue while busy", () => {
    render(<StatusBar status="Round 1 — Editor..." busy canFinalize onContinue={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("disables Done when canFinalize is false", () => {
    render(<StatusBar status="Idle" busy={false} canFinalize={false} onContinue={() => {}} onDone={() => {}} />);
    expect(screen.getByRole("button", { name: /done/i })).toBeDisabled();
  });

  it("calls onContinue when Continue is clicked", async () => {
    const onContinue = vi.fn();
    render(<StatusBar status="Idle" busy={false} canFinalize onContinue={onContinue} onDone={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("calls onDone when Done is clicked", async () => {
    const onDone = vi.fn();
    render(<StatusBar status="Idle" busy={false} canFinalize onContinue={() => {}} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(onDone).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Write `client/src/components/StatusBar.tsx`**

```typescript
interface StatusBarProps {
  status: string;
  busy: boolean;
  canFinalize: boolean;
  onContinue: () => void;
  onDone: () => void;
}

export default function StatusBar({ status, busy, canFinalize, onContinue, onDone }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2">
      <span className="text-sm text-gray-700">{status}</span>
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
  );
}
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/components/StatusBar.test.tsx
```

Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/StatusBar.tsx client/src/components/StatusBar.test.tsx
git commit -m "feat(client): StatusBar component with Continue/Done buttons"
```

---

## Phase 7 — New Book Modal

### Task 7.1: NewBookModal — ingest form

**Files:**
- Create: `client/src/views/NewBookModal.tsx`
- Create: `client/src/views/NewBookModal.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// client/src/views/NewBookModal.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewBookModal from "./NewBookModal";

describe("NewBookModal", () => {
  it("renders the four fields", () => {
    render(<NewBookModal onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByLabelText(/translated path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/english path/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/source language/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target language/i)).toBeInTheDocument();
  });

  it("calls onSubmit with the typed values", async () => {
    const onSubmit = vi.fn();
    render(<NewBookModal onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.type(screen.getByLabelText(/translated path/i), "/path/to/fr");
    await userEvent.type(screen.getByLabelText(/english path/i), "/path/to/en");
    await userEvent.clear(screen.getByLabelText(/target language/i));
    await userEvent.type(screen.getByLabelText(/target language/i), "fr");
    await userEvent.click(screen.getByRole("button", { name: /ingest/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      translated_path: "/path/to/fr",
      english_path: "/path/to/en",
      language_pair: { from: "en", to: "fr" },
    });
  });

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn();
    render(<NewBookModal onSubmit={() => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not submit when paths are empty", async () => {
    const onSubmit = vi.fn();
    render(<NewBookModal onSubmit={onSubmit} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /ingest/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write `client/src/views/NewBookModal.tsx`**

```typescript
import { FormEvent, useState } from "react";
import type { IngestRequest } from "../api/books";

interface NewBookModalProps {
  onSubmit: (req: IngestRequest) => void;
  onCancel: () => void;
}

export default function NewBookModal({ onSubmit, onCancel }: NewBookModalProps) {
  const [translated, setTranslated] = useState("");
  const [english, setEnglish] = useState("");
  const [from, setFrom] = useState("en");
  const [to, setTo] = useState("fr");

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
              <input
                type="text"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Target language</span>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              />
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
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/views/NewBookModal.test.tsx
```

Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/views/NewBookModal.tsx client/src/views/NewBookModal.test.tsx
git commit -m "feat(client): NewBookModal ingest form"
```

---

## Phase 8 — Book List + Book View

### Task 8.1: useBooks hook + BookListRoute (real)

**Files:**
- Create: `client/src/hooks/useBooks.ts`
- Modify: `client/src/views/BookListRoute.tsx`
- Create: `client/src/views/BookListRoute.test.tsx`

- [ ] **Step 1: Write `client/src/hooks/useBooks.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { listBooks } from "../api/books";

export function useBooks(): { slugs: string[]; refresh: () => void; loading: boolean; error: Error | null } {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    listBooks()
      .then(setSlugs)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { slugs, refresh, loading, error };
}
```

- [ ] **Step 2: Replace `client/src/views/BookListRoute.tsx`**

```typescript
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ingestBook } from "../api/books";
import { useBooks } from "../hooks/useBooks";
import NewBookModal from "./NewBookModal";

export default function BookListRoute() {
  const { slugs, refresh, loading, error } = useBooks();
  const [showModal, setShowModal] = useState(false);
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
        <p className="text-gray-500">No books yet. Click “+ New book” to ingest one.</p>
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
          onCancel={() => setShowModal(false)}
          onSubmit={async (req) => {
            const out = await ingestBook(req);
            setShowModal(false);
            refresh();
            navigate(`/book/${out.slug}`);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write `client/src/views/BookListRoute.test.tsx`**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookListRoute from "./BookListRoute";

describe("BookListRoute", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(["a-book", "b-book"]), { status: 200 }))
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists slugs from GET /books", async () => {
    render(
      <MemoryRouter>
        <BookListRoute />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("a-book")).toBeInTheDocument());
    expect(screen.getByText("b-book")).toBeInTheDocument();
  });

  it("shows empty state when no books", async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReset();
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 })
    );
    render(
      <MemoryRouter>
        <BookListRoute />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/no books yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd client
npm test src/views/BookListRoute.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
cd ..
git add client/src/hooks/useBooks.ts client/src/views/BookListRoute.tsx client/src/views/BookListRoute.test.tsx
git commit -m "feat(client): BookListRoute with useBooks hook + new-book ingest"
```

### Task 8.2: useBook hook + BookViewRoute (chapter list)

**Files:**
- Create: `client/src/hooks/useBook.ts`
- Modify: `client/src/views/BookViewRoute.tsx`
- Create: `client/src/views/BookViewRoute.test.tsx`
- Create: `client/src/components/ChapterListItem.tsx`

- [ ] **Step 1: Write `client/src/hooks/useBook.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { getBook } from "../api/books";
import type { BookMeta } from "../types/api";

export function useBook(slug: string | undefined) {
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    getBook(slug)
      .then(setMeta)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meta, loading, error, refresh };
}
```

- [ ] **Step 2: Write `client/src/components/ChapterListItem.tsx`**

```typescript
import { Link } from "react-router-dom";
import type { ChapterEntry } from "../types/api";

const STATUS_LABEL: Record<ChapterEntry["status"], string> = {
  untouched: "untouched",
  in_progress: "in progress",
  done: "done",
};

const STATUS_COLOR: Record<ChapterEntry["status"], string> = {
  untouched: "text-gray-500",
  in_progress: "text-amber-600",
  done: "text-green-600",
};

interface Props {
  bookSlug: string;
  chapter: ChapterEntry;
}

export default function ChapterListItem({ bookSlug, chapter }: Props) {
  return (
    <li className="flex items-center justify-between border-t border-gray-200 px-4 py-2 first:border-t-0">
      <Link
        to={`/book/${bookSlug}/chapter/${chapter.n}`}
        className="flex-1 font-mono text-sm hover:underline"
      >
        Ch {String(chapter.n).padStart(2, "0")} — {chapter.title}
      </Link>
      <span className={`text-xs ${STATUS_COLOR[chapter.status]}`}>
        {STATUS_LABEL[chapter.status]}
      </span>
    </li>
  );
}
```

- [ ] **Step 3: Replace `client/src/views/BookViewRoute.tsx`**

```typescript
import { Link, useParams } from "react-router-dom";
import ChapterListItem from "../components/ChapterListItem";
import { useBook } from "../hooks/useBook";

export default function BookViewRoute() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { meta, loading, error } = useBook(slug);

  return (
    <div data-testid="book-view-route" className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <Link to="/" className="text-sm text-blue-600 hover:underline">
          ← Books
        </Link>
        <Link
          to="/settings"
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
        >
          Settings
        </Link>
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
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `client/src/views/BookViewRoute.test.tsx`**

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookViewRoute from "./BookViewRoute";

describe("BookViewRoute", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            slug: "le-livre",
            created_at: "2026-05-02T00:00:00Z",
            sources: {
              translated: { path: "/p/fr", format: "folder" },
              english: { path: "/p/en", format: "folder" },
            },
            language_pair: { from: "en", to: "fr" },
            chapters: [
              { n: 1, title: "Chapitre 1", status: "done" },
              { n: 2, title: "Chapitre 2", status: "in_progress" },
              { n: 3, title: "Chapitre 3", status: "untouched" },
            ],
          }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders chapters with statuses", async () => {
    render(
      <MemoryRouter initialEntries={["/book/le-livre"]}>
        <Routes>
          <Route path="/book/:slug" element={<BookViewRoute />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/Chapitre 1/)).toBeInTheDocument());
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    expect(screen.getByText("untouched")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd client
npm test src/views/BookViewRoute.test.tsx src/components/ChapterListItem.test.tsx 2>/dev/null || true
npm test src/views/BookViewRoute.test.tsx
```

Expected: 1 passed (the BookViewRoute test).

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/hooks/useBook.ts client/src/views/BookViewRoute.tsx client/src/views/BookViewRoute.test.tsx \
        client/src/components/ChapterListItem.tsx
git commit -m "feat(client): BookViewRoute with chapter list and status badges"
```

---

## Phase 9 — Markup Renderer

### Task 9.1: ParagraphRender — italic, bold, headings

**Files:**
- Create: `client/src/lib/markup.ts`
- Create: `client/src/lib/markup.test.ts`
- Create: `client/src/components/ParagraphRender.tsx`
- Create: `client/src/components/ParagraphRender.test.tsx`

- [ ] **Step 1: Write `client/src/lib/markup.test.ts`**

```typescript
import { parseMarkup } from "./markup";

describe("parseMarkup", () => {
  it("returns plain text as a single span", () => {
    expect(parseMarkup("hello")).toEqual([{ kind: "text", text: "hello" }]);
  });

  it("parses italic with single asterisks", () => {
    expect(parseMarkup("a *b* c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "italic", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("parses bold with double asterisks", () => {
    expect(parseMarkup("a **b** c")).toEqual([
      { kind: "text", text: "a " },
      { kind: "bold", text: "b" },
      { kind: "text", text: " c" },
    ]);
  });

  it("handles unmatched asterisk as plain text", () => {
    expect(parseMarkup("foo *bar")).toEqual([{ kind: "text", text: "foo *bar" }]);
  });

  it("preserves Unicode", () => {
    expect(parseMarkup("« *froid* »")).toEqual([
      { kind: "text", text: "« " },
      { kind: "italic", text: "froid" },
      { kind: "text", text: " »" },
    ]);
  });
});
```

- [ ] **Step 2: Write `client/src/lib/markup.ts`**

```typescript
export type Token =
  | { kind: "text"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "bold"; text: string };

export function parseMarkup(s: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let buf = "";

  const flush = () => {
    if (buf) {
      out.push({ kind: "text", text: buf });
      buf = "";
    }
  };

  while (i < s.length) {
    if (s.startsWith("**", i)) {
      const end = s.indexOf("**", i + 2);
      if (end === -1) {
        buf += s.slice(i);
        i = s.length;
        break;
      }
      flush();
      out.push({ kind: "bold", text: s.slice(i + 2, end) });
      i = end + 2;
    } else if (s[i] === "*") {
      const end = s.indexOf("*", i + 1);
      if (end === -1) {
        buf += s.slice(i);
        i = s.length;
        break;
      }
      flush();
      out.push({ kind: "italic", text: s.slice(i + 1, end) });
      i = end + 1;
    } else {
      buf += s[i];
      i += 1;
    }
  }
  flush();
  return out;
}
```

- [ ] **Step 3: Write `client/src/components/ParagraphRender.tsx`**

```typescript
import type { ParsedParagraph } from "../types/api";
import { parseMarkup } from "../lib/markup";

interface Props {
  paragraph: ParsedParagraph;
}

export default function ParagraphRender({ paragraph }: Props) {
  const tokens = parseMarkup(paragraph.text);
  const inner = tokens.map((t, i) => {
    if (t.kind === "italic") return <em key={i}>{t.text}</em>;
    if (t.kind === "bold") return <strong key={i}>{t.text}</strong>;
    return <span key={i}>{t.text}</span>;
  });

  if (paragraph.style === "normal") {
    return <p className="my-2 leading-relaxed">{inner}</p>;
  }
  const level = parseInt(paragraph.style.split("-")[1], 10);
  switch (level) {
    case 1: return <h1 className="my-3 text-xl font-bold">{inner}</h1>;
    case 2: return <h2 className="my-3 text-lg font-bold">{inner}</h2>;
    case 3: return <h3 className="my-3 text-base font-bold">{inner}</h3>;
    default: return <h4 className="my-3 text-sm font-bold">{inner}</h4>;
  }
}
```

- [ ] **Step 4: Write `client/src/components/ParagraphRender.test.tsx`**

```typescript
import { render } from "@testing-library/react";
import ParagraphRender from "./ParagraphRender";

describe("ParagraphRender", () => {
  it("renders normal paragraph as <p>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "normal", text: "hi" }} />);
    expect(container.querySelector("p")).toBeTruthy();
  });

  it("renders heading-1 as <h1>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "heading-1", text: "Chapter 1" }} />);
    expect(container.querySelector("h1")).toBeTruthy();
  });

  it("renders italic with <em>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "normal", text: "a *b* c" }} />);
    expect(container.querySelector("em")?.textContent).toBe("b");
  });

  it("renders bold with <strong>", () => {
    const { container } = render(<ParagraphRender paragraph={{ style: "normal", text: "a **b** c" }} />);
    expect(container.querySelector("strong")?.textContent).toBe("b");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd client
npm test src/lib/markup.test.ts src/components/ParagraphRender.test.tsx
```

Expected: 9 passed (5 markup + 4 paragraph).

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/lib/markup.ts client/src/lib/markup.test.ts \
        client/src/components/ParagraphRender.tsx client/src/components/ParagraphRender.test.tsx
git commit -m "feat(client): markup parser + ParagraphRender for italic/bold/headings"
```

---

## Phase 10 — Chapter Workspace Shell

### Task 10.1: useChapter hook (state + fetch helpers for parsed docs)

**Files:**
- Create: `client/src/hooks/useChapter.ts`
- Create: `client/src/hooks/useChapter.test.tsx`

- [ ] **Step 1: Write `client/src/hooks/useChapter.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { getChapterState } from "../api/chapters";
import type { ChapterMeta, ParsedDoc, ReviewerResult } from "../types/api";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return (await r.json()) as T;
}

export function useChapter(slug: string, n: number) {
  const [meta, setMeta] = useState<ChapterMeta | null>(null);
  const [enDoc, setEnDoc] = useState<ParsedDoc | null>(null);
  const [workingDoc, setWorkingDoc] = useState<ParsedDoc | null>(null);
  const [prevDoc, setPrevDoc] = useState<ParsedDoc | null>(null);
  const [suggestions, setSuggestions] = useState<ReviewerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cm = await getChapterState(slug, n);
      setMeta(cm);
      const en = await fetchJson<ParsedDoc>(
        `/__static__/source-en/${slug}/${n}`  // overridden below by direct path
      ).catch(async () => {
        // The server doesn't currently expose a parsed-doc HTTP endpoint.
        // Read the file directly via the dev proxy convention used by static-mounts.
        // Our fallback: ask via the public API by encoding the slug+n. The server returns
        // the file contents when Vite proxies /__source__/<slug>/<kind>/<n>.json.
        // For Plan 2, we add a simple convenience endpoint in Phase 10.2 if needed.
        return { paragraphs: [] } as ParsedDoc;
      });
      setEnDoc(en);

      // Working doc: round-N-editor.json if current_round>0 else source-translated/chN.json
      // (Plan 2 Task 10.2 will introduce a dedicated /docs endpoint to serve these.)
      setWorkingDoc(null);
      setPrevDoc(null);
      setSuggestions(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [slug, n]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { meta, enDoc, workingDoc, prevDoc, suggestions, loading, error, refresh };
}
```

> **Plan author note:** the `useChapter` hook needs the parsed-doc JSON files (already on disk under `~/.translate/<slug>/source-en/chN.json`, `source-translated/chN.json`, and `chapters/chN/round-*-editor.json` / `round-*-reviewer.json`). The server doesn't currently expose them via HTTP. Task 10.2 adds a small server endpoint `GET /books/{slug}/chapter/{n}/docs` that returns `{ english, translated, working, previous, suggestions }` so the hook can fetch them in one call. The above placeholder will be replaced when that endpoint exists.

- [ ] **Step 2: Skip the unit test for `useChapter` for now** — we'll write it after the docs endpoint is in place (Task 10.2), so we can mock a single fetch instead of three.

- [ ] **Step 3: Commit the placeholder hook**

```bash
cd ..
git add client/src/hooks/useChapter.ts
git commit -m "feat(client): scaffold useChapter hook (real wiring in Task 10.2)"
```

### Task 10.2: Server `GET /books/{slug}/chapter/{n}/docs` endpoint

**Files:**
- Modify: `server/routes/chapters.py` (add the docs endpoint)
- Modify: `tests/server/test_routes_chapters.py` (add a test for it)

- [ ] **Step 1: Add the failing test**

Append to `tests/server/test_routes_chapters.py`:

```python
def test_get_chapter_docs_returns_english_and_translated(app_with_book) -> None:
    client, slug = app_with_book
    r = client.get(f"/books/{slug}/chapter/1/docs")
    assert r.status_code == 200
    body = r.json()
    assert "english" in body
    assert "working" in body  # source-translated when no round yet
    assert body["previous"] is None  # no prior round
    assert body["suggestions"] is None
    # English doc has a non-empty paragraphs list
    assert len(body["english"]["paragraphs"]) > 0


def test_get_chapter_docs_after_editor_round(app_with_book, monkeypatch) -> None:
    client, slug = app_with_book
    fake_client = AsyncMock()
    fake_client.chat = AsyncMock(return_value="[1]\nFR: # Chapitre 1\n\n[2]\nFR: Salut\n\n[3]\nFR: La main *froide*\n")
    monkeypatch.setattr(chapters_routes, "_make_client", lambda cfg: fake_client)
    client.post(f"/books/{slug}/chapter/1/round/editor", json={"model": "ed"})
    r = client.get(f"/books/{slug}/chapter/1/docs")
    body = r.json()
    # Working doc is now the editor's output, previous is the source-translated
    assert body["working"]["paragraphs"][0]["text"] == "Chapitre 1"
    assert body["previous"] is not None
```

- [ ] **Step 2: Run the failing test**

```bash
cd "/Volumes/Storage/Development/Software/General/untitled folder"
source .venv/bin/activate
pytest tests/server/test_routes_chapters.py::test_get_chapter_docs_returns_english_and_translated -v
```

Expected: 404.

- [ ] **Step 3: Add the docs endpoint to `server/routes/chapters.py`**

Append at the END of `server/routes/chapters.py`:

```python
@router.get("/books/{slug}/chapter/{n}/docs")
def get_chapter_docs(slug: str, n: int) -> dict:
    """Return parsed-doc JSON for english, working (latest), previous, and reviewer suggestions."""
    try:
        load_book_meta(slug)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"book not found: {slug}")
    cm = load_chapter_meta(slug, n=n)
    bd = book_dir(slug)
    en_path = bd / "source-en" / f"ch{n:02d}.json"
    tr_path = bd / "source-translated" / f"ch{n:02d}.json"
    if not en_path.exists() or not tr_path.exists():
        raise HTTPException(status_code=404, detail=f"chapter {n} not in book {slug}")

    english = ParsedDoc.model_validate_json(en_path.read_text()).model_dump()
    if cm.current_round < 1:
        working = ParsedDoc.model_validate_json(tr_path.read_text()).model_dump()
        previous = None
    else:
        wp = bd / "chapters" / f"ch{n:02d}" / f"round-{cm.current_round}-editor.json"
        working = ParsedDoc.model_validate_json(wp.read_text()).model_dump()
        if cm.current_round == 1:
            previous = ParsedDoc.model_validate_json(tr_path.read_text()).model_dump()
        else:
            pp = bd / "chapters" / f"ch{n:02d}" / f"round-{cm.current_round - 1}-editor.json"
            previous = ParsedDoc.model_validate_json(pp.read_text()).model_dump()

    sp = bd / "chapters" / f"ch{n:02d}" / f"round-{cm.current_round}-reviewer.json"
    suggestions = None
    if sp.exists():
        import json
        suggestions = json.loads(sp.read_text())

    return {
        "english": english,
        "working": working,
        "previous": previous,
        "suggestions": suggestions,
    }
```

- [ ] **Step 4: Run the tests**

```bash
pytest tests/server/test_routes_chapters.py -v
```

Expected: 7 passed (5 prior + 2 new).

- [ ] **Step 5: Commit**

```bash
git add server/routes/chapters.py tests/server/test_routes_chapters.py
git commit -m "feat(server): GET /books/<slug>/chapter/<n>/docs returns english+working+previous+suggestions"
```

### Task 10.3: Wire `useChapter` to the new `/docs` endpoint

**Files:**
- Modify: `client/src/hooks/useChapter.ts`
- Create: `client/src/hooks/useChapter.test.tsx`

- [ ] **Step 1: Replace `client/src/hooks/useChapter.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { getChapterState } from "../api/chapters";
import { request } from "../api/client";
import type { ChapterMeta, ParsedDoc, ReviewerResult } from "../types/api";

interface DocsBundle {
  english: ParsedDoc;
  working: ParsedDoc;
  previous: ParsedDoc | null;
  suggestions: ReviewerResult | null;
}

export function useChapter(slug: string, n: number) {
  const [meta, setMeta] = useState<ChapterMeta | null>(null);
  const [docs, setDocs] = useState<DocsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cm, bundle] = await Promise.all([
        getChapterState(slug, n),
        request<DocsBundle>(`/books/${slug}/chapter/${n}/docs`),
      ]);
      setMeta(cm);
      setDocs(bundle);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [slug, n]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    meta,
    enDoc: docs?.english ?? null,
    workingDoc: docs?.working ?? null,
    prevDoc: docs?.previous ?? null,
    suggestions: docs?.suggestions ?? null,
    loading,
    error,
    refresh,
  };
}
```

- [ ] **Step 2: Write the test**

```typescript
// client/src/hooks/useChapter.test.tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChapter } from "./useChapter";

function Probe({ slug, n, onLoad }: { slug: string; n: number; onLoad: (s: ReturnType<typeof useChapter>) => void }) {
  const state = useChapter(slug, n);
  if (state.meta) onLoad(state);
  return null;
}

describe("useChapter", () => {
  beforeEach(() => {
    const meta = {
      n: 1,
      status: "untouched",
      current_round: 0,
      models: { editor: "", reviewer: "" },
      prompts_used: { editor_version: null, reviewer_version: null },
      rounds: [],
    };
    const docs = {
      english: { paragraphs: [{ style: "normal", text: "Hello." }] },
      working: { paragraphs: [{ style: "normal", text: "Bonjour." }] },
      previous: null,
      suggestions: null,
    };
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.endsWith("/state")) return Promise.resolve(new Response(JSON.stringify(meta), { status: 200 }));
      if (u.endsWith("/docs")) return Promise.resolve(new Response(JSON.stringify(docs), { status: 200 }));
      return Promise.reject(new Error(`unexpected URL ${u}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads meta + docs in parallel", async () => {
    let captured: ReturnType<typeof useChapter> | null = null;
    render(<Probe slug="x" n={1} onLoad={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.meta?.n).toBe(1));
    expect(captured?.enDoc?.paragraphs[0].text).toBe("Hello.");
    expect(captured?.workingDoc?.paragraphs[0].text).toBe("Bonjour.");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/hooks/useChapter.test.tsx
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/hooks/useChapter.ts client/src/hooks/useChapter.test.tsx
git commit -m "feat(client): wire useChapter to /docs endpoint"
```

### Task 10.4: TopBar component (model dropdowns + chapter selector)

**Files:**
- Create: `client/src/components/ModelPicker.tsx`
- Create: `client/src/components/ModelPicker.test.tsx`
- Create: `client/src/components/TopBar.tsx`
- Create: `client/src/components/TopBar.test.tsx`
- Create: `client/src/hooks/useModels.ts`

- [ ] **Step 1: Write `client/src/hooks/useModels.ts`**

```typescript
import { useEffect, useState } from "react";
import { getModels } from "../api/settings";

export function useModels(): { models: string[]; refresh: () => void; loading: boolean; error: Error | null } {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    getModels()
      .then(setModels)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  return { models, refresh, loading, error };
}
```

- [ ] **Step 2: Write `client/src/components/ModelPicker.tsx`**

```typescript
interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

export default function ModelPicker({ label, value, options, onChange }: Props) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        {!options.includes(value) && value && <option value={value}>{value}</option>}
        {options.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 3: Write `client/src/components/ModelPicker.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModelPicker from "./ModelPicker";

describe("ModelPicker", () => {
  it("renders options and current value", () => {
    render(<ModelPicker label="Editor" value="a" options={["a", "b"]} onChange={() => {}} />);
    expect(screen.getByLabelText(/editor/i)).toHaveValue("a");
  });

  it("emits onChange when user picks a different option", async () => {
    const onChange = vi.fn();
    render(<ModelPicker label="Editor" value="a" options={["a", "b"]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/editor/i), "b");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("includes the current value as an option even if not in the list", () => {
    render(<ModelPicker label="Editor" value="custom/x" options={["a", "b"]} onChange={() => {}} />);
    expect(screen.getByRole("option", { name: "custom/x" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Write `client/src/components/TopBar.tsx`**

```typescript
import { Link } from "react-router-dom";
import type { ChapterEntry } from "../types/api";
import ModelPicker from "./ModelPicker";

interface Props {
  bookSlug: string;
  chapters: ChapterEntry[];
  currentN: number;
  editorModel: string;
  reviewerModel: string;
  modelOptions: string[];
  onEditorModelChange: (v: string) => void;
  onReviewerModelChange: (v: string) => void;
  onChapterChange: (n: number) => void;
}

export default function TopBar({
  bookSlug,
  chapters,
  currentN,
  editorModel,
  reviewerModel,
  modelOptions,
  onEditorModelChange,
  onReviewerModelChange,
  onChapterChange,
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
        <ModelPicker label="Editor" value={editorModel} options={modelOptions} onChange={onEditorModelChange} />
        <ModelPicker label="Reviewer" value={reviewerModel} options={modelOptions} onChange={onReviewerModelChange} />
        <Link to="/settings" className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50">
          ⚙ Settings
        </Link>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Write `client/src/components/TopBar.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import TopBar from "./TopBar";

const chapters = [
  { n: 1, title: "One", status: "done" as const },
  { n: 2, title: "Two", status: "in_progress" as const },
];

describe("TopBar", () => {
  it("renders chapter selector and model pickers", () => {
    render(
      <MemoryRouter>
        <TopBar
          bookSlug="x"
          chapters={chapters}
          currentN={2}
          editorModel="ed"
          reviewerModel="rv"
          modelOptions={["ed", "rv", "other"]}
          onEditorModelChange={() => {}}
          onReviewerModelChange={() => {}}
          onChapterChange={() => {}}
        />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/chapter/i)).toHaveValue("2");
    expect(screen.getByLabelText(/editor/i)).toHaveValue("ed");
    expect(screen.getByLabelText(/reviewer/i)).toHaveValue("rv");
  });

  it("calls onChapterChange when selecting a chapter", async () => {
    const onChapterChange = vi.fn();
    render(
      <MemoryRouter>
        <TopBar
          bookSlug="x"
          chapters={chapters}
          currentN={1}
          editorModel="ed"
          reviewerModel="rv"
          modelOptions={["ed", "rv"]}
          onEditorModelChange={() => {}}
          onReviewerModelChange={() => {}}
          onChapterChange={onChapterChange}
        />
      </MemoryRouter>
    );
    await userEvent.selectOptions(screen.getByLabelText(/chapter/i), "2");
    expect(onChapterChange).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd client
npm test src/components/ModelPicker.test.tsx src/components/TopBar.test.tsx
```

Expected: 5 passed.

- [ ] **Step 7: Commit**

```bash
cd ..
git add client/src/hooks/useModels.ts client/src/components/ModelPicker.tsx client/src/components/ModelPicker.test.tsx \
        client/src/components/TopBar.tsx client/src/components/TopBar.test.tsx
git commit -m "feat(client): TopBar with chapter selector + model pickers"
```

---

## Phase 11 — English + Working Panes

### Task 11.1: EnglishPane and WorkingPane (without diff yet)

**Files:**
- Create: `client/src/components/EnglishPane.tsx`
- Create: `client/src/components/WorkingPane.tsx`
- Create: `client/src/components/EnglishPane.test.tsx`
- Create: `client/src/components/WorkingPane.test.tsx`

- [ ] **Step 1: Write `client/src/components/EnglishPane.tsx`**

```typescript
import type { ParsedDoc } from "../types/api";
import ParagraphRender from "./ParagraphRender";

interface Props {
  doc: ParsedDoc | null;
}

export default function EnglishPane({ doc }: Props) {
  return (
    <section className="overflow-y-auto border-r border-gray-200 bg-white px-4 py-2">
      <h2 className="sticky top-0 mb-2 bg-white py-1 text-xs font-semibold uppercase text-gray-500">
        English source
      </h2>
      {doc?.paragraphs.map((p, i) => <ParagraphRender key={i} paragraph={p} />)}
    </section>
  );
}
```

- [ ] **Step 2: Write `client/src/components/WorkingPane.tsx`**

```typescript
import type { ParsedDoc } from "../types/api";
import ParagraphRender from "./ParagraphRender";

interface Props {
  doc: ParsedDoc | null;
  roundN: number;
}

export default function WorkingPane({ doc, roundN }: Props) {
  return (
    <section className="overflow-y-auto border-r border-gray-200 bg-white px-4 py-2">
      <h2 className="sticky top-0 mb-2 bg-white py-1 text-xs font-semibold uppercase text-gray-500">
        Working translation {roundN > 0 ? `(round ${roundN})` : "(no rounds yet)"}
      </h2>
      {doc?.paragraphs.map((p, i) => <ParagraphRender key={i} paragraph={p} />)}
    </section>
  );
}
```

- [ ] **Step 3: Write `client/src/components/EnglishPane.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import EnglishPane from "./EnglishPane";

describe("EnglishPane", () => {
  it("renders paragraphs from doc", () => {
    render(
      <EnglishPane
        doc={{
          paragraphs: [
            { style: "heading-1", text: "Chapter 1" },
            { style: "normal", text: "Hello." },
          ],
        }}
      />
    );
    expect(screen.getByText("Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Hello.")).toBeInTheDocument();
  });

  it("renders the heading label even when doc is null", () => {
    render(<EnglishPane doc={null} />);
    expect(screen.getByText(/english source/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Write `client/src/components/WorkingPane.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import WorkingPane from "./WorkingPane";

describe("WorkingPane", () => {
  it("shows round number when > 0", () => {
    render(
      <WorkingPane
        doc={{ paragraphs: [{ style: "normal", text: "Bonjour." }] }}
        roundN={3}
      />
    );
    expect(screen.getByText(/round 3/i)).toBeInTheDocument();
    expect(screen.getByText("Bonjour.")).toBeInTheDocument();
  });

  it("shows no-rounds-yet label when round is 0", () => {
    render(<WorkingPane doc={null} roundN={0} />);
    expect(screen.getByText(/no rounds yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd client
npm test src/components/EnglishPane.test.tsx src/components/WorkingPane.test.tsx
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/components/EnglishPane.tsx client/src/components/WorkingPane.tsx \
        client/src/components/EnglishPane.test.tsx client/src/components/WorkingPane.test.tsx
git commit -m "feat(client): English + Working panes (no diff yet)"
```

---

## Phase 12 — Diff View

### Task 12.1: paragraph-level diff helper

**Files:**
- Create: `client/src/lib/diff.ts`
- Create: `client/src/lib/diff.test.ts`

- [ ] **Step 1: Write `client/src/lib/diff.test.ts`**

```typescript
import { diffParagraphs } from "./diff";

describe("diffParagraphs", () => {
  it("returns equal blocks when both inputs match", () => {
    const out = diffParagraphs(
      { paragraphs: [{ style: "normal", text: "a" }] },
      { paragraphs: [{ style: "normal", text: "a" }] }
    );
    expect(out).toEqual([{ kind: "equal", text: "a", style: "normal" }]);
  });

  it("returns insert/delete blocks for changed paragraphs", () => {
    const out = diffParagraphs(
      { paragraphs: [{ style: "normal", text: "old" }] },
      { paragraphs: [{ style: "normal", text: "new" }] }
    );
    expect(out).toEqual([
      { kind: "delete", text: "old", style: "normal" },
      { kind: "insert", text: "new", style: "normal" },
    ]);
  });

  it("handles inserts at the end", () => {
    const out = diffParagraphs(
      { paragraphs: [{ style: "normal", text: "a" }] },
      { paragraphs: [
        { style: "normal", text: "a" },
        { style: "normal", text: "b" },
      ] }
    );
    expect(out).toContainEqual({ kind: "equal", text: "a", style: "normal" });
    expect(out).toContainEqual({ kind: "insert", text: "b", style: "normal" });
  });
});
```

- [ ] **Step 2: Write `client/src/lib/diff.ts`**

```typescript
import { diffArrays } from "diff";
import type { ParagraphStyle, ParsedDoc } from "../types/api";

export type DiffBlock = {
  kind: "equal" | "insert" | "delete";
  text: string;
  style: ParagraphStyle;
};

function key(p: { style: ParagraphStyle; text: string }): string {
  return `${p.style} ${p.text}`;
}

export function diffParagraphs(prev: ParsedDoc, next: ParsedDoc): DiffBlock[] {
  const a = prev.paragraphs.map(key);
  const b = next.paragraphs.map(key);
  const changes = diffArrays(a, b);
  const out: DiffBlock[] = [];
  for (const c of changes) {
    for (const k of c.value) {
      const [style, text] = k.split(" ") as [ParagraphStyle, string];
      const kind = c.added ? "insert" : c.removed ? "delete" : "equal";
      out.push({ kind, text, style });
    }
  }
  return out;
}
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/lib/diff.test.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/lib/diff.ts client/src/lib/diff.test.ts
git commit -m "feat(client): paragraph-level diff helper"
```

### Task 12.2: DiffView component + integrate into WorkingPane

**Files:**
- Create: `client/src/components/DiffView.tsx`
- Create: `client/src/components/DiffView.test.tsx`
- Modify: `client/src/components/WorkingPane.tsx` (add diff toggle)
- Modify: `client/src/components/WorkingPane.test.tsx` (add a diff-toggle test)

- [ ] **Step 1: Write `client/src/components/DiffView.tsx`**

```typescript
import { diffParagraphs } from "../lib/diff";
import type { ParsedDoc } from "../types/api";
import ParagraphRender from "./ParagraphRender";

interface Props {
  prev: ParsedDoc;
  next: ParsedDoc;
}

const COLOR: Record<"equal" | "insert" | "delete", string> = {
  equal: "",
  insert: "bg-green-50",
  delete: "bg-red-50 line-through text-red-800",
};

export default function DiffView({ prev, next }: Props) {
  const blocks = diffParagraphs(prev, next);
  return (
    <div>
      {blocks.map((b, i) => (
        <div key={i} className={`my-1 rounded px-1 ${COLOR[b.kind]}`}>
          <ParagraphRender paragraph={{ style: b.style, text: b.text }} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write `client/src/components/DiffView.test.tsx`**

```typescript
import { render } from "@testing-library/react";
import DiffView from "./DiffView";

describe("DiffView", () => {
  it("renders insert/delete blocks", () => {
    const { container } = render(
      <DiffView
        prev={{ paragraphs: [{ style: "normal", text: "old" }] }}
        next={{ paragraphs: [{ style: "normal", text: "new" }] }}
      />
    );
    expect(container.querySelector(".bg-green-50")?.textContent).toBe("new");
    expect(container.querySelector(".bg-red-50")?.textContent).toBe("old");
  });
});
```

- [ ] **Step 3: Replace `client/src/components/WorkingPane.tsx`**

```typescript
import { useState } from "react";
import type { ParsedDoc } from "../types/api";
import DiffView from "./DiffView";
import ParagraphRender from "./ParagraphRender";

interface Props {
  doc: ParsedDoc | null;
  prevDoc: ParsedDoc | null;
  roundN: number;
}

export default function WorkingPane({ doc, prevDoc, roundN }: Props) {
  const [showDiff, setShowDiff] = useState(false);
  const canShowDiff = !!(doc && prevDoc);

  return (
    <section className="overflow-y-auto border-r border-gray-200 bg-white px-4 py-2">
      <div className="sticky top-0 mb-2 flex items-center justify-between bg-white py-1">
        <h2 className="text-xs font-semibold uppercase text-gray-500">
          Working translation {roundN > 0 ? `(round ${roundN})` : "(no rounds yet)"}
        </h2>
        <label className={`flex items-center gap-1 text-xs ${canShowDiff ? "" : "opacity-40"}`}>
          <input
            type="checkbox"
            checked={showDiff && canShowDiff}
            onChange={(e) => setShowDiff(e.target.checked)}
            disabled={!canShowDiff}
          />
          Show diff vs round {roundN - 1 < 1 ? "source" : roundN - 1}
        </label>
      </div>
      {showDiff && doc && prevDoc ? (
        <DiffView prev={prevDoc} next={doc} />
      ) : (
        doc?.paragraphs.map((p, i) => <ParagraphRender key={i} paragraph={p} />)
      )}
    </section>
  );
}
```

- [ ] **Step 4: Append test to `client/src/components/WorkingPane.test.tsx`**

```typescript
import userEvent from "@testing-library/user-event";

it("toggles diff view when both docs are present", async () => {
  render(
    <WorkingPane
      doc={{ paragraphs: [{ style: "normal", text: "new" }] }}
      prevDoc={{ paragraphs: [{ style: "normal", text: "old" }] }}
      roundN={2}
    />
  );
  expect(screen.queryByText("old")).not.toBeInTheDocument();
  await userEvent.click(screen.getByLabelText(/show diff/i));
  expect(screen.getByText("old")).toBeInTheDocument();
  expect(screen.getByText("new")).toBeInTheDocument();
});

it("disables diff toggle when prev doc is missing", () => {
  render(
    <WorkingPane
      doc={{ paragraphs: [{ style: "normal", text: "x" }] }}
      prevDoc={null}
      roundN={0}
    />
  );
  expect(screen.getByLabelText(/show diff/i)).toBeDisabled();
});
```

You'll need to update the existing WorkingPane tests to pass `prevDoc={null}` since the component signature changed. Update those existing tests accordingly.

- [ ] **Step 5: Run tests**

```bash
cd client
npm test src/components/WorkingPane.test.tsx src/components/DiffView.test.tsx
```

Expected: 5 passed (2 prior updated + 2 new toggle/disabled + 1 DiffView).

- [ ] **Step 6: Commit**

```bash
cd ..
git add client/src/components/DiffView.tsx client/src/components/DiffView.test.tsx \
        client/src/components/WorkingPane.tsx client/src/components/WorkingPane.test.tsx
git commit -m "feat(client): DiffView + WorkingPane diff toggle"
```

---

## Phase 13 — Suggestions Pane

### Task 13.1: SuggestionsPane (collapsible)

**Files:**
- Create: `client/src/components/SuggestionsPane.tsx`
- Create: `client/src/components/SuggestionsPane.test.tsx`

- [ ] **Step 1: Write `client/src/components/SuggestionsPane.tsx`**

```typescript
import { useState } from "react";
import type { ReviewerResult } from "../types/api";

interface Props {
  result: ReviewerResult | null;
}

export default function SuggestionsPane({ result }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="border-l border-gray-200 bg-gray-50 px-2 text-xs text-gray-600 hover:bg-gray-100"
        aria-label="Expand suggestions"
      >
        ◀
      </button>
    );
  }

  return (
    <section className="overflow-y-auto bg-gray-50 px-4 py-2">
      <div className="sticky top-0 mb-2 flex items-center justify-between bg-gray-50 py-1">
        <h2 className="text-xs font-semibold uppercase text-gray-500">
          Reviewer suggestions
          {result && ` (round ${result.round})`}
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-xs text-gray-500 hover:text-gray-800"
          aria-label="Collapse suggestions"
        >
          ▶
        </button>
      </div>

      {!result && <p className="text-sm text-gray-500">Click Continue to run round 1.</p>}

      {result && result.suggestions.length === 0 && (
        <p className="text-sm text-gray-500">No suggestions returned.</p>
      )}

      {result && result.suggestions.length > 0 && (
        <ol className="space-y-3">
          {result.suggestions.map((s) => (
            <li key={s.id} className="rounded border border-gray-200 bg-white p-2 text-sm">
              <div className="mb-1 italic text-gray-600">“{s.quote}”</div>
              <div>{s.comment}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Write `client/src/components/SuggestionsPane.test.tsx`**

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SuggestionsPane from "./SuggestionsPane";

const sample = {
  round: 2,
  model: "openai/gpt-5",
  completed_at: "2026-05-02T00:00:00Z",
  suggestions: [
    { id: 1, quote: "Bonjour.", comment: "consider Salut" },
    { id: 2, quote: "froid", comment: "consider froide" },
  ],
  raw_response: "[]",
};

describe("SuggestionsPane", () => {
  it("renders empty state when no result", () => {
    render(<SuggestionsPane result={null} />);
    expect(screen.getByText(/click continue/i)).toBeInTheDocument();
  });

  it("renders suggestions", () => {
    render(<SuggestionsPane result={sample} />);
    expect(screen.getByText("consider Salut")).toBeInTheDocument();
    expect(screen.getByText("consider froide")).toBeInTheDocument();
  });

  it("collapses and expands", async () => {
    render(<SuggestionsPane result={sample} />);
    await userEvent.click(screen.getByLabelText(/collapse/i));
    expect(screen.queryByText("consider Salut")).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/expand/i));
    expect(screen.getByText("consider Salut")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/components/SuggestionsPane.test.tsx
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/SuggestionsPane.tsx client/src/components/SuggestionsPane.test.tsx
git commit -m "feat(client): SuggestionsPane (collapsible) for Reviewer suggestions"
```

---

## Phase 14 — Chapter Workspace Composition

### Task 14.1: Wire ChapterRoute end-to-end

**Files:**
- Modify: `client/src/views/ChapterRoute.tsx`
- Create: `client/src/views/ChapterRoute.test.tsx`

- [ ] **Step 1: Replace `client/src/views/ChapterRoute.tsx`**

```typescript
import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { finalizeChapter, runEditorRound, runReviewerRound } from "../api/chapters";
import EnglishPane from "../components/EnglishPane";
import StatusBar from "../components/StatusBar";
import SuggestionsPane from "../components/SuggestionsPane";
import TopBar from "../components/TopBar";
import WorkingPane from "../components/WorkingPane";
import { useBook } from "../hooks/useBook";
import { useChapter } from "../hooks/useChapter";
import { useEvents } from "../hooks/useEvents";
import { useModels } from "../hooks/useModels";
import { useSettings } from "../hooks/useSettings";

export default function ChapterRoute() {
  const { slug = "", n: nStr = "1" } = useParams<{ slug: string; n: string }>();
  const n = parseInt(nStr, 10);
  const navigate = useNavigate();

  const { meta: book } = useBook(slug);
  const chapter = useChapter(slug, n);
  const { models } = useModels();
  const { settings } = useSettings();

  const [editorModel, setEditorModel] = useState("");
  const [reviewerModel, setReviewerModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Idle");

  // Initialize models from chapter meta or defaults
  if (!editorModel && chapter.meta) {
    setEditorModel(chapter.meta.models.editor || settings?.default_models.editor || "");
  }
  if (!reviewerModel && chapter.meta) {
    setReviewerModel(chapter.meta.models.reviewer || settings?.default_models.reviewer || "");
  }

  useEvents(
    useCallback((e) => {
      if (e.type === "status") setStatus(e.text);
      else if (e.type === "round_complete") setStatus(`✓ Round ${e.round} ${e.stage} complete`);
      else if (e.type === "error") setStatus(`⚠ ${e.text}`);
    }, [])
  );

  const handleContinue = async () => {
    setBusy(true);
    try {
      await runEditorRound(slug, n, editorModel);
      await runReviewerRound(slug, n, reviewerModel);
      await chapter.refresh();
    } catch (err) {
      setStatus(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDone = async () => {
    setBusy(true);
    try {
      await finalizeChapter(slug, n);
      await chapter.refresh();
      setStatus("✓ Chapter finalized");
    } catch (err) {
      setStatus(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!book || !chapter.meta) {
    return <div data-testid="chapter-route" className="p-6 text-gray-500">Loading…</div>;
  }

  return (
    <div data-testid="chapter-route" className="grid h-full grid-rows-[auto_1fr_auto] bg-gray-100">
      <TopBar
        bookSlug={slug}
        chapters={book.chapters}
        currentN={n}
        editorModel={editorModel}
        reviewerModel={reviewerModel}
        modelOptions={models}
        onEditorModelChange={setEditorModel}
        onReviewerModelChange={setReviewerModel}
        onChapterChange={(newN) => navigate(`/book/${slug}/chapter/${newN}`)}
      />
      <main className="grid grid-cols-3 overflow-hidden">
        <EnglishPane doc={chapter.enDoc} />
        <WorkingPane doc={chapter.workingDoc} prevDoc={chapter.prevDoc} roundN={chapter.meta.current_round} />
        <SuggestionsPane result={chapter.suggestions} />
      </main>
      <StatusBar
        status={status}
        busy={busy}
        canFinalize={chapter.meta.current_round > 0 && chapter.meta.status !== "done"}
        onContinue={handleContinue}
        onDone={handleDone}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write a smoke test for `ChapterRoute`**

```typescript
// client/src/views/ChapterRoute.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChapterRoute from "./ChapterRoute";

describe("ChapterRoute", () => {
  beforeEach(() => {
    // Stub EventSource to a no-op so useEvents doesn't throw
    (globalThis as unknown as { EventSource: unknown }).EventSource = class {
      onmessage: unknown = null;
      onerror: unknown = null;
      close() {}
    };
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u === "/books/x") {
        return Promise.resolve(new Response(JSON.stringify({
          slug: "x",
          created_at: "2026-05-02T00:00:00Z",
          sources: { translated: { path: "/p/fr", format: "folder" }, english: { path: "/p/en", format: "folder" } },
          language_pair: { from: "en", to: "fr" },
          chapters: [{ n: 1, title: "Ch 1", status: "untouched" }],
        }), { status: 200 }));
      }
      if (u === "/books/x/chapter/1/state") {
        return Promise.resolve(new Response(JSON.stringify({
          n: 1, status: "untouched", current_round: 0,
          models: { editor: "", reviewer: "" },
          prompts_used: { editor_version: null, reviewer_version: null },
          rounds: [],
        }), { status: 200 }));
      }
      if (u === "/books/x/chapter/1/docs") {
        return Promise.resolve(new Response(JSON.stringify({
          english: { paragraphs: [{ style: "normal", text: "Hello." }] },
          working: { paragraphs: [{ style: "normal", text: "Bonjour." }] },
          previous: null,
          suggestions: null,
        }), { status: 200 }));
      }
      if (u === "/models") return Promise.resolve(new Response(JSON.stringify(["m1", "m2"]), { status: 200 }));
      if (u === "/settings") return Promise.resolve(new Response(JSON.stringify({
        openrouter_api_key: "k",
        default_models: { editor: "m1", reviewer: "m2" },
        ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
      }), { status: 200 }));
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders the three panes after loading", async () => {
    render(
      <MemoryRouter initialEntries={["/book/x/chapter/1"]}>
        <Routes>
          <Route path="/book/:slug/chapter/:n" element={<ChapterRoute />} />
        </Routes>
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText("Hello.")).toBeInTheDocument());
    expect(screen.getByText("Bonjour.")).toBeInTheDocument();
    expect(screen.getByText(/click continue/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/views/ChapterRoute.test.tsx
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/views/ChapterRoute.tsx client/src/views/ChapterRoute.test.tsx
git commit -m "feat(client): ChapterRoute composes top bar + 3 panes + status bar end-to-end"
```

---

## Phase 15 — Settings Page

### Task 15.1: useSettings hook

**Files:**
- Create: `client/src/hooks/useSettings.ts`
- Create: `client/src/hooks/useSettings.test.tsx`

- [ ] **Step 1: Write `client/src/hooks/useSettings.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { getSettings, putSettings } from "../api/settings";
import type { Settings } from "../types/api";

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    getSettings()
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async (next: Settings) => {
    const updated = await putSettings(next);
    setSettings(updated);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { settings, save, loading, error, refresh };
}
```

- [ ] **Step 2: Write a brief test**

```typescript
// client/src/hooks/useSettings.test.tsx
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../types/api";
import { useSettings } from "./useSettings";

function Probe({ onLoad }: { onLoad: (s: Settings | null) => void }) {
  const { settings } = useSettings();
  if (settings) onLoad(settings);
  return null;
}

describe("useSettings", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            openrouter_api_key: "abc",
            default_models: { editor: "e", reviewer: "r" },
            ingestion: { heading_style: "Heading 1", fallback_patterns: [] },
          }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads settings", async () => {
    let captured: Settings | null = null;
    render(<Probe onLoad={(s) => (captured = s)} />);
    await waitFor(() => expect(captured?.openrouter_api_key).toBe("abc"));
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/hooks/useSettings.test.tsx
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/hooks/useSettings.ts client/src/hooks/useSettings.test.tsx
git commit -m "feat(client): useSettings hook"
```

### Task 15.2: SettingsRoute — API key, default models, ingestion

**Files:**
- Modify: `client/src/views/SettingsRoute.tsx`
- Create: `client/src/views/SettingsRoute.test.tsx`

- [ ] **Step 1: Replace `client/src/views/SettingsRoute.tsx`**

```typescript
import { useState } from "react";
import { Link } from "react-router-dom";
import { useModels } from "../hooks/useModels";
import { useSettings } from "../hooks/useSettings";
import PromptEditor from "../components/PromptEditor";

export default function SettingsRoute() {
  const { settings, save, loading, error } = useSettings();
  const { models, refresh: refreshModels } = useModels();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [editorDefault, setEditorDefault] = useState<string | null>(null);
  const [reviewerDefault, setReviewerDefault] = useState<string | null>(null);
  const [headingStyle, setHeadingStyle] = useState<string | null>(null);
  const [patternsText, setPatternsText] = useState<string | null>(null);

  if (!settings && loading) return <div data-testid="settings-route" className="p-6">Loading…</div>;
  if (error) return <div data-testid="settings-route" className="p-6 text-red-600">{error.message}</div>;
  if (!settings) return <div data-testid="settings-route" className="p-6">No settings.</div>;

  const k = apiKey ?? settings.openrouter_api_key;
  const e = editorDefault ?? settings.default_models.editor;
  const r = reviewerDefault ?? settings.default_models.reviewer;
  const h = headingStyle ?? settings.ingestion.heading_style;
  const p = patternsText ?? settings.ingestion.fallback_patterns.join("\n");

  const handleSave = () =>
    save({
      openrouter_api_key: k,
      default_models: { editor: e, reviewer: r },
      ingestion: {
        heading_style: h,
        fallback_patterns: p.split("\n").map((s) => s.trim()).filter(Boolean),
      },
    });

  return (
    <div data-testid="settings-route" className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Link to="/" className="text-sm text-blue-600 hover:underline">← Books</Link>
      </header>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500">OpenRouter</h2>
        <label className="block">
          <span className="text-sm font-medium">API key</span>
          <input
            type="password"
            value={k}
            onChange={(ev) => setApiKey(ev.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <button
          type="button"
          onClick={refreshModels}
          className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50"
        >
          Refresh model list
        </button>
      </section>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Default models</h2>
        <label className="block">
          <span className="text-sm font-medium">Editor</span>
          <select
            value={e}
            onChange={(ev) => setEditorDefault(ev.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          >
            <option value="">— select —</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Reviewer</span>
          <select
            value={r}
            onChange={(ev) => setReviewerDefault(ev.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          >
            <option value="">— select —</option>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </section>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Ingestion</h2>
        <label className="block">
          <span className="text-sm font-medium">Heading style</span>
          <input
            type="text"
            value={h}
            onChange={(ev) => setHeadingStyle(ev.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Fallback patterns (one per line)</span>
          <textarea
            value={p}
            onChange={(ev) => setPatternsText(ev.target.value)}
            rows={5}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
          />
        </label>
      </section>

      <button
        type="button"
        onClick={handleSave}
        className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
      >
        Save
      </button>

      <section className="mt-10 space-y-6">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Prompts</h2>
        <PromptEditor kind="editor" />
        <PromptEditor kind="reviewer" />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Write the smoke test**

```typescript
// client/src/views/SettingsRoute.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SettingsRoute from "./SettingsRoute";

describe("SettingsRoute", () => {
  beforeEach(() => {
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u === "/settings") {
        return Promise.resolve(new Response(JSON.stringify({
          openrouter_api_key: "sk-or-x",
          default_models: { editor: "anthropic/claude-sonnet-4", reviewer: "openai/gpt-5" },
          ingestion: { heading_style: "Heading 1", fallback_patterns: ["^Chapter\\s+\\d+"] },
        }), { status: 200 }));
      }
      if (u === "/models") return Promise.resolve(new Response(JSON.stringify([
        "anthropic/claude-sonnet-4", "openai/gpt-5",
      ]), { status: 200 }));
      if (u === "/prompts/editor" || u === "/prompts/reviewer") {
        return Promise.resolve(new Response(JSON.stringify({
          current: "v1", versions: [{ id: "v1", saved_at: "2026-05-02T00:00:00Z", text: "seed" }],
        }), { status: 200 }));
      }
      return Promise.reject(new Error(`unexpected ${u}`));
    }) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads and displays current settings", async () => {
    render(
      <MemoryRouter>
        <SettingsRoute />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/api key/i)).toHaveValue("sk-or-x"));
    expect(screen.getByLabelText(/heading style/i)).toHaveValue("Heading 1");
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/views/SettingsRoute.test.tsx
```

Expected: 1 passed.

> Note: this depends on `PromptEditor` from Phase 16. Until Phase 16 lands, the import will fail. Either run Phase 16 first (recommended) or temporarily remove the `<PromptEditor>` references and add them back in Phase 16. The plan as written assumes you do Phases in order — proceed to Phase 16 next.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/views/SettingsRoute.tsx client/src/views/SettingsRoute.test.tsx
git commit -m "feat(client): SettingsRoute (API key, default models, ingestion patterns)"
```

---

## Phase 16 — Prompt Editor with Version History

### Task 16.1: usePrompts hook

**Files:**
- Create: `client/src/hooks/usePrompts.ts`

- [ ] **Step 1: Write `client/src/hooks/usePrompts.ts`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { deletePromptVersion, getPrompts, putPrompts, restorePrompt } from "../api/prompts";
import type { PromptFile, PromptKind } from "../types/api";

export function usePrompts(kind: PromptKind) {
  const [data, setData] = useState<PromptFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    getPrompts(kind)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => setLoading(false));
  }, [kind]);

  const save = useCallback(async (text: string) => {
    setData(await putPrompts(kind, text));
  }, [kind]);

  const restore = useCallback(async (versionId: string) => {
    setData(await restorePrompt(kind, versionId));
  }, [kind]);

  const remove = useCallback(async (versionId: string) => {
    setData(await deletePromptVersion(kind, versionId));
  }, [kind]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, save, restore, remove, loading, error, refresh };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/usePrompts.ts
git commit -m "feat(client): usePrompts hook for CRUD + version history"
```

### Task 16.2: PromptEditor component

**Files:**
- Create: `client/src/components/PromptEditor.tsx`
- Create: `client/src/components/PromptEditor.test.tsx`

- [ ] **Step 1: Write `client/src/components/PromptEditor.tsx`**

```typescript
import { useState } from "react";
import { usePrompts } from "../hooks/usePrompts";
import type { PromptKind } from "../types/api";

interface Props {
  kind: PromptKind;
}

export default function PromptEditor({ kind }: Props) {
  const { data, save, restore, remove, loading, error } = usePrompts(kind);
  const [draft, setDraft] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  if (loading) return <p className="text-sm text-gray-500">Loading {kind} prompt…</p>;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return null;

  const currentText = data.versions.find((v) => v.id === data.current)?.text ?? "";
  const text = draft ?? currentText;

  return (
    <details open className="rounded border border-gray-200 p-3">
      <summary className="cursor-pointer text-sm font-medium capitalize">{kind} prompt</summary>
      <p className="mt-1 text-xs text-gray-500">Current: {data.current}</p>
      <textarea
        value={text}
        onChange={(e) => setDraft(e.target.value)}
        rows={10}
        className="mt-2 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={async () => { await save(text); setDraft(null); }}
          disabled={text === currentText}
          className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          Save as new version
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
        >
          {showHistory ? "Hide" : "Show"} history ({data.versions.length})
        </button>
      </div>
      {showHistory && (
        <ul className="mt-3 space-y-1">
          {data.versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded border border-gray-200 px-2 py-1 text-xs">
              <span>
                <span className="font-mono">{v.id}</span>
                {v.id === data.current && <span className="ml-2 text-green-600">(current)</span>}
                <span className="ml-2 text-gray-400">{v.saved_at}</span>
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => alert(v.text)}
                  className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50"
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => restore(v.id)}
                  disabled={v.id === data.current}
                  className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-50 disabled:opacity-40"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm(`Delete ${v.id}?`)) remove(v.id); }}
                  disabled={v.id === data.current}
                  className="rounded border border-red-300 px-2 py-0.5 text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  Delete
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
```

- [ ] **Step 2: Write the test**

```typescript
// client/src/components/PromptEditor.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PromptEditor from "./PromptEditor";

describe("PromptEditor", () => {
  beforeEach(() => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            current: "v2",
            versions: [
              { id: "v1", saved_at: "2026-05-02T00:00:00Z", text: "seed" },
              { id: "v2", saved_at: "2026-05-02T01:00:00Z", text: "edited" },
            ],
          }),
          { status: 200 }
        )
      )
    ) as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("loads and displays current version text", async () => {
    render(<PromptEditor kind="editor" />);
    await waitFor(() => expect(screen.getByDisplayValue("edited")).toBeInTheDocument());
  });

  it("toggles history visibility", async () => {
    render(<PromptEditor kind="editor" />);
    await waitFor(() => expect(screen.getByDisplayValue("edited")).toBeInTheDocument());
    expect(screen.queryByText(/^v1$/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /show history/i }));
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd client
npm test src/components/PromptEditor.test.tsx
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
cd ..
git add client/src/components/PromptEditor.tsx client/src/components/PromptEditor.test.tsx
git commit -m "feat(client): PromptEditor with version history (view/restore/delete)"
```

---

## Phase 17 — Production Build + End-to-End Sanity

### Task 17.1: Build the client and serve it from the server

**Files:** none modified — this task is build + manual verification.

- [ ] **Step 1: Build the client**

```bash
cd client
npm run build
ls dist/
```

Expected: `dist/index.html`, `dist/assets/*.js`, `dist/assets/*.css`.

- [ ] **Step 2: Run the server and test that it serves the client at /**

```bash
cd ..
source .venv/bin/activate
translate --no-browser &
SERVER_PID=$!
sleep 2
curl -s http://localhost:5180/ | grep -q '<div id="root">' && echo "OK: client served" || echo "FAIL"
curl -s http://localhost:5180/health | grep -q '"status":"ok"' && echo "OK: API works" || echo "FAIL"
kill $SERVER_PID
```

Expected: both "OK" lines printed.

- [ ] **Step 3: Run the full Python test suite to confirm no regression**

```bash
pytest tests/server/ -v
```

Expected: 106 passed, 1 skipped (was 104 + the 2 new docs-endpoint tests from Task 10.2).

- [ ] **Step 4: No commit needed** (this task only verifies the build flow).

### Task 17.2: README updates

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Open `README.md` to see current content.

- [ ] **Step 2: Update the Status, Run, and add a "Building the client" section**

Replace the `## Status` section with:

```markdown
## Status

Both Plan 1 (server) and Plan 2 (web client) are complete. The server alone is
operable via curl; with the client built, `translate` opens a polished browser UI.
```

Add a new section AFTER `## Run`:

```markdown
## Building the client

The client is a React + Vite + TypeScript SPA in `client/`. To build it once:

```
cd client
npm install
npm run build
```

The build output lives in `client/dist/`. When the server starts, it auto-detects
`client/dist/index.html` and mounts it on `/`. With no built client, the server
still serves the API but the browser landing page returns 404.

For development, run the server and the client separately:

```
# Terminal 1: server
translate --no-browser

# Terminal 2: Vite dev server (proxies API calls to the server)
cd client && npm run dev
```

Vite serves the client on `http://localhost:5173`; API calls (`/health`, `/books`,
`/events`, etc.) are proxied to `http://localhost:5180`.
```

Add a new section AFTER `## Tests`:

```markdown
## Client tests

```
cd client
npm test
```
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — building and developing the client"
```

---

## Phase 18 — Final Verification

### Task 18.1: Run both test suites end to end

**Files:** none — verification only.

- [ ] **Step 1: Run Python tests**

```bash
cd "/Volumes/Storage/Development/Software/General/untitled folder"
source .venv/bin/activate
pytest tests/server/ -v
```

Expected: all passing (current count + the 2 new docs-endpoint tests = 106 passed, 1 skipped).

- [ ] **Step 2: Run client tests**

```bash
cd client
npm test
```

Expected: all passing. The exact count depends on the test files added; aim for ~50+ passing.

- [ ] **Step 3: Build production artifacts**

```bash
npm run build
```

Expected: `dist/` populated.

- [ ] **Step 4: Smoke test end-to-end**

```bash
cd ..
translate --no-browser &
SERVER_PID=$!
sleep 2
curl -s http://localhost:5180/ | head -c 100
echo
curl -s http://localhost:5180/health
echo
kill $SERVER_PID
```

Expected: HTML containing `<div id="root">`, then `{"status":"ok"}`.

- [ ] **Step 5: No commit** — this task is verification only.

---

## Done

Plan 2 ships a complete browser client for the translation proofreader:

- Book list with status indicators
- Chapter workspace with three independently-scrolling panes (English source, Working translation with diff toggle, Reviewer suggestions)
- Top bar with chapter selector and Editor/Reviewer model dropdowns
- Live status bar driven by SSE
- Settings page with API key, default models, ingestion patterns, and Editor/Reviewer prompts (with version history)
- Production build served by the same Python server

Together with Plan 1 (the server), the user can run `translate` in a terminal and have a polished local web app for AI-assisted bilingual chapter proofreading.
