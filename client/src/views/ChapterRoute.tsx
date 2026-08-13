import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { finalizeChapter, runEditorRound, runReviewerRound } from "../api/chapters";
import type { ChapterMeta } from "../types/api";
import { ApiError } from "../api/client";
import BatchControls from "../components/BatchControls";
import EnglishPane from "../components/EnglishPane";
import StatusBar, { type ActivityEntry } from "../components/StatusBar";
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
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [stream, setStream] = useState("");
  const [busySince, setBusySince] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

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

  // Tick the elapsed-time counter while a round is running so the user can
  // see something is alive even when the model is slow to respond.
  useEffect(() => {
    if (!busy || busySince === null) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - busySince) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [busy, busySince]);

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
      // The activity log shows everything (batch runs span chapters); the live
      // stream pane shows only THIS chapter's current attempt.
      const mine = e.chapter === undefined || e.chapter === n;
      if (e.type === "status") {
        appendActivity(e.text, "status");
        // Reset on a new send AND on a retry, so a failed attempt's partial
        // output never concatenates with its retry's.
        if (mine && (e.phase === "sent" || e.phase === "retry")) setStream("");
      } else if (e.type === "token") {
        if (!mine) return;
        // Keep only a rolling tail so the buffer can't grow unbounded.
        setStream((prev) => (prev + e.text).slice(-4000));
      } else if (e.type === "round_complete") {
        appendActivity(
          `✓ Ch ${e.chapter ?? "?"} R${e.round} ${e.stage} complete`,
          "complete",
        );
        if (mine) setStream("");
      } else if (e.type === "error") {
        appendActivity(`⚠ ${e.text}`, "error");
        if (mine) setStream("");
      }
    }, [appendActivity, n])
  );

  // Pull the most useful human-readable message out of an unknown error.
  // Our server's typed error responses look like { detail: { message, kind } };
  // ApiError stores .detail. Plain strings come through as detail too.
  function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const d = err.detail as unknown;
      if (typeof d === "string") return `HTTP ${err.status}: ${d}`;
      if (d && typeof d === "object" && "message" in (d as Record<string, unknown>)) {
        return `HTTP ${err.status}: ${(d as { message: string }).message}`;
      }
      return `HTTP ${err.status}`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  // A "round" is Editor → Reviewer → Editor (apply suggestions). The leading
  // editor is skipped when the chapter already has an editor pass that hasn't
  // been reviewed yet, so back-to-back Continues don't redo work.
  function needsLeadingEditor(meta: ChapterMeta): boolean {
    if (meta.current_round === 0) return true;
    const last = meta.rounds.find((r) => r.n === meta.current_round);
    return !last || last.reviewer_completed_at != null;
  }

  const handleContinue = async () => {
    setBusy(true);
    setBusySince(Date.now());
    try {
      if (needsLeadingEditor(chapter.meta!)) {
        await runEditorRound(slug, n, editorModel);
      }
      await runReviewerRound(slug, n, reviewerModel);
      await runEditorRound(slug, n, editorModel);
      await chapter.refresh();
    } catch (err) {
      appendActivity(`⚠ ${errorMessage(err)}`, "error");
    } finally {
      setBusy(false);
      setBusySince(null);
    }
  };

  const handleDone = async () => {
    setBusy(true);
    setBusySince(Date.now());
    try {
      await finalizeChapter(slug, n);
      await chapter.refresh();
      appendActivity(`✓ Ch ${n} finalized`, "complete");
    } catch (err) {
      appendActivity(`⚠ ${errorMessage(err)}`, "error");
    } finally {
      setBusy(false);
      setBusySince(null);
    }
  };

  if (!book || !chapter.meta) {
    return <div data-testid="chapter-route" className="p-6 text-gray-500">Loading…</div>;
  }

  return (
    <div data-testid="chapter-route" className="grid h-full grid-rows-[auto_1fr_auto_auto] bg-gray-100">
      <TopBar
        bookSlug={slug}
        chapters={book.chapters}
        currentN={n}
        editorModel={editorModel}
        reviewerModel={reviewerModel}
        models={models}
        onEditorModelChange={setEditorModel}
        onReviewerModelChange={setReviewerModel}
        onChapterChange={(newN) => navigate(`/book/${slug}/chapter/${newN}`)}
      />
      <main className="grid grid-cols-3 overflow-hidden">
        <EnglishPane doc={chapter.enDoc} />
        <WorkingPane doc={chapter.workingDoc} prevDoc={chapter.prevDoc} roundN={chapter.meta.current_round} />
        <SuggestionsPane
          result={chapter.suggestions}
          bookSlug={slug}
          chapterN={n}
          currentRound={chapter.meta.current_round}
        />
      </main>
      <BatchControls
        chapters={book.chapters}
        currentN={n}
        bookSlug={slug}
        editorModel={editorModel}
        reviewerModel={reviewerModel}
        disabled={busy}
        onBatchStart={() => {
          setBusy(true);
          setBusySince(Date.now());
        }}
        onBatchEnd={() => {
          setBusy(false);
          setBusySince(null);
          chapter.refresh();
        }}
        onProgress={(ev) => {
          if (ev.type === "chapter_start") {
            appendActivity(
              `▶ Batch ch ${ev.chapterN} (${ev.chapterIndex}/${ev.totalChapters}): ${ev.chapterTitle ?? ""}`,
              "status",
            );
          } else if (ev.type === "chapter_done") {
            appendActivity(`✓ Batch ch ${ev.chapterN} done`, "complete");
          } else if (ev.type === "error") {
            appendActivity(`⚠ Batch ch ${ev.chapterN}: ${ev.error}`, "error");
          } else if (ev.type === "done") {
            appendActivity("✓ Batch complete", "complete");
          }
        }}
      />
      <StatusBar
        activity={activity}
        stream={stream}
        busy={busy}
        elapsed={elapsed}
        canFinalize={chapter.meta.current_round > 0 && chapter.meta.status !== "done"}
        onContinue={handleContinue}
        onDone={handleDone}
      />
    </div>
  );
}
