import type { PromptFile, PromptKind } from "../types/api";
import { request } from "./client";

export const getPrompts = (kind: PromptKind) => request<PromptFile>(`/prompts/${kind}`);

export const putPrompts = (kind: PromptKind, text: string) =>
  request<PromptFile>(`/prompts/${kind}`, { method: "PUT", body: { text } });

export const restorePrompt = (kind: PromptKind, versionId: string) =>
  request<PromptFile>(`/prompts/${kind}/restore/${versionId}`, { method: "POST" });

export const deletePromptVersion = (kind: PromptKind, versionId: string) =>
  request<PromptFile>(`/prompts/${kind}/${versionId}`, { method: "DELETE" });
