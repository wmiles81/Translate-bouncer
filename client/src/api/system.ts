import { request } from "./client";

export interface PickPathResponse {
  path: string | null;
}

export const pickPath = (kind: "file" | "folder") =>
  request<PickPathResponse>("/system/pick-path", { method: "POST", body: { kind } });
