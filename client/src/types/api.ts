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

// OpenRouter model metadata returned by GET /models.
// Fields are optional because OpenRouter is inconsistent across models.
export interface Model {
  id: string;
  name?: string;
  created?: number;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  supported_parameters?: string[];
}

// Parsed-doc shape used by panes (mirrors server/docx_io.py)
export type ParagraphStyle = "normal" | `heading-${1 | 2 | 3 | 4 | 5 | 6}`;
export interface ParsedParagraph {
  style: ParagraphStyle;
  text: string;
}
export interface ParsedDoc {
  paragraphs: ParsedParagraph[];
}
