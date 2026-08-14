import { useState } from "react";
import { Link } from "react-router-dom";
import ModelPicker from "../components/ModelPicker";
import PromptEditor from "../components/PromptEditor";
import { useModels } from "../hooks/useModels";
import { useProviders } from "../hooks/useProviders";
import { useSettings } from "../hooks/useSettings";

export default function SettingsRoute() {
  const { settings, save, loading, error } = useSettings();
  const { models, refresh: refreshModels, error: modelsError, loading: modelsLoading } = useModels();
  const { providers, refresh: refreshProviders, loading: providersLoading } = useProviders();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [editorDefault, setEditorDefault] = useState<string | null>(null);
  const [reviewerDefault, setReviewerDefault] = useState<string | null>(null);
  const [headingStyle, setHeadingStyle] = useState<string | null>(null);
  const [patternsText, setPatternsText] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!settings && loading) return <div data-testid="settings-route" className="p-6">Loading…</div>;
  if (error) return <div data-testid="settings-route" className="p-6 text-red-600">{error.message}</div>;
  if (!settings) return <div data-testid="settings-route" className="p-6">No settings.</div>;

  const k = apiKey ?? settings.openrouter_api_key ?? "";
  const e = editorDefault ?? settings.default_models.editor;
  const r = reviewerDefault ?? settings.default_models.reviewer;
  const h = headingStyle ?? settings.ingestion.heading_style;
  const p = patternsText ?? settings.ingestion.fallback_patterns.join("\n");

  // Persist the current form state, with optional just-changed overrides (React
  // state updates haven't landed yet when a change handler calls this).
  const saveAll = async (over: { editor?: string; reviewer?: string; key?: string } = {}) => {
    setSaveError(null);
    setSaved(false);
    try {
      await save({
        openrouter_api_key: over.key ?? k,
        default_models: { editor: over.editor ?? e, reviewer: over.reviewer ?? r },
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

  const handleSave = () => saveAll();

  // Refresh the model list and re-detect installed provider CLIs. Fetch errors land in
  // the hooks' own error state (modelsError); the busy state is the hooks' loading flags.
  const refreshing = modelsLoading || providersLoading;
  const handleRefreshModels = () => {
    refreshModels();
    refreshProviders();
  };

  return (
    <div data-testid="settings-route" className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Settings</h1>
        <div className="flex items-center gap-3">
          <a
            href="/help/index.html?ctx=settings"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Help
          </a>
          <Link to="/" className="text-sm text-blue-600 hover:underline">← Books</Link>
        </div>
      </header>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500">
          AI providers (your subscriptions)
        </h2>
        <p className="text-sm text-gray-600">
          Translate routes provider-CLI models (claude-code, codex, gemini, qwen) through
          an AI CLI you've signed into; every other model id routes through OpenRouter
          using the API key below. Use either or both.
        </p>
        <ul className="space-y-1" data-testid="provider-list">
          {providers.map((pr) => (
            <li key={pr.id} className="flex items-center gap-2 text-sm">
              <span
                className={pr.detected ? "text-green-600" : "text-gray-400"}
                aria-hidden
              >
                {pr.detected ? "●" : "○"}
              </span>
              <span className={pr.detected ? "text-gray-800" : "text-gray-400"}>
                {pr.name}
              </span>
              <span className="text-xs text-gray-400">
                {pr.detected ? "detected" : "not found"}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefreshModels}
            disabled={refreshing}
            className="rounded border border-gray-300 px-2 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh model list"}
          </button>
          {modelsError && <span className="text-sm text-red-600">{modelsError.message}</span>}
          {!modelsError && models.length > 0 && (
            <span className="text-sm text-gray-500">{models.length} models</span>
          )}
        </div>
      </section>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500">OpenRouter</h2>
        <label className="block">
          <span className="text-sm font-medium">API key</span>
          <input
            type="password"
            value={k}
            onChange={(ev) => setApiKey(ev.target.value)}
            onBlur={async () => {
              // Persist on blur, then refresh so the OpenRouter models appear at once.
              if (apiKey !== null && apiKey !== settings.openrouter_api_key) {
                await saveAll({ key: apiKey });
                handleRefreshModels();
              }
            }}
            placeholder="sk-or-..."
            autoComplete="off"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <p className="text-sm text-gray-600">
          Optional. With a key set, the model list includes every OpenRouter model and any
          non-CLI model id (e.g. from your saved defaults) routes through OpenRouter.
          The key saves when you click away from the field.
        </p>
      </section>

      <section className="mb-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Default models</h2>
        {/* Selections persist immediately — no separate Save click needed. */}
        <ModelPicker
          label="Editor"
          value={e}
          models={models}
          onChange={(id) => { setEditorDefault(id); void saveAll({ editor: id }); }}
        />
        <ModelPicker
          label="Reviewer"
          value={r}
          models={models}
          onChange={(id) => { setReviewerDefault(id); void saveAll({ reviewer: id }); }}
        />
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
