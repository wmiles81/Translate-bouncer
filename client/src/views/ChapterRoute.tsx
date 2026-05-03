import { useCallback, useEffect, useState } from "react";
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

  // Initialize models from chapter meta or defaults (once meta + settings load)
  useEffect(() => {
    if (chapter.meta && !editorModel) {
      setEditorModel(chapter.meta.models.editor || settings?.default_models.editor || "");
    }
    if (chapter.meta && !reviewerModel) {
      setReviewerModel(chapter.meta.models.reviewer || settings?.default_models.reviewer || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.meta, settings]);

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
