import type { Settings } from "../types/api";
import { request } from "./client";

export const getSettings = () => request<Settings>("/settings");

export const putSettings = (cfg: Settings) =>
  request<Settings>("/settings", { method: "PUT", body: cfg });

export const getModels = () => request<string[]>("/models");
