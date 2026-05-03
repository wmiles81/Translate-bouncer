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
