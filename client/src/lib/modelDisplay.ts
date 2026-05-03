import type { Model } from "../types/api";

export function provider(m: Model): string {
  return m.id.split("/")[0] || "unknown";
}

export function isFree(m: Model): boolean {
  const p = parseFloat(m.pricing?.prompt ?? "0");
  const c = parseFloat(m.pricing?.completion ?? "0");
  return p === 0 && c === 0;
}

export function supportsTools(m: Model): boolean {
  return (m.supported_parameters ?? []).includes("tools");
}

export function contextK(m: Model): string {
  if (!m.context_length) return "?";
  const n = m.context_length;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

// Convert "$ per token" string into "$ per million tokens".
function pricePerMillion(s: string | undefined): string {
  if (!s) return "?";
  const v = parseFloat(s);
  if (!Number.isFinite(v)) return "?";
  if (v === 0) return "free";
  const perM = v * 1_000_000;
  if (perM >= 100) return `$${perM.toFixed(0)}`;
  if (perM >= 1) return `$${perM.toFixed(2)}`;
  return `$${perM.toFixed(3)}`;
}

export function inputPrice(m: Model): string {
  return pricePerMillion(m.pricing?.prompt);
}

export function outputPrice(m: Model): string {
  return pricePerMillion(m.pricing?.completion);
}

export function displayName(m: Model): string {
  return m.name ?? m.id;
}
