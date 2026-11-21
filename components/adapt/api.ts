"use client";

import type { AnalysisResult, EnrichResult, ParsedResume, ProfileAnswer, ProfileFigure } from "@/lib/cv/types";
import type { AtsReadiness } from "@/lib/ats/checks";
import type { OfferResult } from "@/lib/offer/fetch";

/** Mesure de la page du CV généré et ajustements faits automatiquement (voir lib/export/balance.ts). */
export type BalanceInfo = {
  before: { pages: number; side: number | null; main: number; overflow: number };
  after: { pages: number; side: number | null; main: number; overflow: number };
  moved: { heading: string; to: "main" | "sidebar" }[];
  hidden: string[];
  attempts: number;
};

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/**
 * Requête vers le serveur, avec un délai maximal : sur téléphone, une connexion coupée (passage
 * dans une autre appli, réseau mobile faible) pouvait laisser l'écran de chargement tourner sans fin.
 */
async function request(url: string, init: RequestInit, timeoutMs = 170_000): Promise<Response> {
  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }
  // Délai dépassé côté serveur (réponse sans JSON)
  if (res.status === 504) throw new ApiError("timeout");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "server_error");
  }
  return res;
}

/**
 * Résultat d’un traitement long (lecture, analyse, enrichissement) : la réponse arrive au fil de
 * l’eau (espaces de maintien de la connexion, puis le JSON) ; une erreur survenue pendant le
 * traitement est dans le corps ({ error }).
 */
async function longResult<T>(res: Response): Promise<T> {
  let body: unknown;
  try {
    body = JSON.parse(await res.text());
  } catch {
    // Réponse interrompue en cours de route (connexion coupée)
    throw new ApiError("network");
  }
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === "string") throw new ApiError(error);
  return body as T;
}

export async function parseResume(file: File): Promise<ParsedResume> {
  const form = new FormData();
  form.append("file", file);
  return longResult<ParsedResume>(await request("/api/cv/parse", { method: "POST", body: form }, 290_000));
}

export async function fetchOffer(url: string): Promise<OfferResult> {
  return (
    await request("/api/offer/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    })
  ).json();
}

export async function analyzeResume(locale: string, resume: ParsedResume, offerText: string): Promise<AnalysisResult> {
  return longResult<AnalysisResult>(
    await request("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        offerText,
        resume: { blocks: resume.blocks, structure: resume.structure },
      }),
    }, 300_000),
  );
}

export async function enrichProfile(
  locale: string,
  resume: ParsedResume,
  offerTitle: string,
  current: Record<string, string>,
  answers: ProfileAnswer[],
  figures: ProfileFigure[] = [],
): Promise<EnrichResult> {
  return longResult<EnrichResult>(
    await request("/api/profile/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        offerTitle,
        current,
        answers,
        figures,
        resume: { blocks: resume.blocks, structure: resume.structure },
      }),
    }, 300_000),
  );
}

export async function exportResume(
  format: "pdf" | "docx",
  file: File | null,
  resume: ParsedResume,
  accepted: Record<string, string>,
  template = "original",
  layout: "compact" | "detailed" = "compact",
  keywords: { term: string; importance: "required" | "nice" }[] = [],
): Promise<{ blob: Blob; pages: number | null; ats: AtsReadiness | null; notice: string | null; balance: BalanceInfo | null }> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ format, template, layout, resume, accepted, keywords }));
  if (resume.format === "docx" && file) form.append("file", file);
  const res = await request("/api/export", { method: "POST", body: form });
  const pages = Number(res.headers.get("x-cv-pages")) || null;
  let ats: AtsReadiness | null = null;
  try {
    const raw = res.headers.get("x-cv-ats");
    if (raw) ats = JSON.parse(decodeURIComponent(raw));
  } catch {}
  // Mesure de la page et ajustements automatiques (colonnes équilibrées, puces masquées)
  let balance: BalanceInfo | null = null;
  try {
    const raw = res.headers.get("x-cv-layout");
    if (raw) balance = JSON.parse(decodeURIComponent(raw));
  } catch {}
  return { blob: await res.blob(), pages, ats, notice: res.headers.get("x-cv-notice"), balance };
}
