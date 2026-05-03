import { useState } from "react";
import { Link } from "react-router-dom";
import { useModels } from "../hooks/useModels";
import { useSettings } from "../hooks/useSettings";
import PromptEditor from "../components/PromptEditor";

export default function SettingsRoute() {
  const { settings, save, loading, error } = useSettings();
  const { models, refresh: refreshModels, error: modelsError } = useModels();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [editorDefault, setEditorDefault] = useState<string | null>(null);
  const [reviewerDefault, setReviewerDefault] = useState<string | null>(null);
  const [headingStyle, setHeadingStyle] = useState<string | null>(null);
  const [patternsText, setPatternsText] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (!settings && loading) return <div data-testid="settings-route" className="p-6">Loading…</div>;
  if (error) return <div data-testid="settings-route" className="p-6 text-red-600">{error.message}</div>;
  if (!settings) return <div data-testid="settings-route" className="p-6">No settings.</div>;

  const k = apiKey ?? settings.openrouter_api_key;
  const e = editorDefault ?? settings.default_models.editor;
  const r = reviewerDefault ?? settings.default_models.reviewer;
  const h = headingStyle ?? settings.ingestion.heading_style;
  const p = patternsText ?? settings.ingestion.fallback_patterns.join("\n");

  const handleSave = async () => {
    setSaveError(null);
    setSaved(false);
    try {
      await save({
        openrouter_api_key: k,
        default_models: { editor: e, reviewer: r },
        ingestion: {
          heading_style: h,
          fallback_patterns: p.split("\n").map((s) => s.trim()).filter(Boolean),
        },
      });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  };

  // Refresh the model list. The /models endpoint reads the API key from the
  // server's config file, so we save the current key first if it's been edited
  // but not yet persisted; otherwise the server returns 400 and the user sees
  // nothing change.
  const handleRefreshModels = async () => {
    setRefreshError(null);
    setRefreshing(true);
    try {
      if (apiKey !== null && apiKey !== settings.openrouter_api_key) {
        await save({
          openrouter_api_key: k,
          default_models: { editor: e, reviewer: r },
          ingestion: {
            heading_style: h,
            fallback_patterns: p.split("\n").map((s) => s.trim()).filter(Boolean),
          },
        });
      }
      refreshModels();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  };

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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefreshModels}
            disabled={refreshing}
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh model list"}
          </button>
          {modelsError && !refreshError && (
            <span className="text-sm text-red-600">{modelsError.message}</span>
          )}
          {refreshError && <span className="text-sm text-red-600">{refreshError}</span>}
          {!refreshError && !modelsError && models.length > 0 && (
            <span className="text-sm text-gray-500">{models.length} models</span>
          )}
        </div>
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700"
        >
          Save
        </button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {saveError && <span className="text-sm text-red-600">{saveError}</span>}
      </div>

      <section className="mt-10 space-y-6">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Prompts</h2>
        <PromptEditor kind="editor" />
        <PromptEditor kind="reviewer" />
      </section>
    </div>
  );
}
