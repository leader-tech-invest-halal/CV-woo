"use client";

import type { AnalysisResult, EnrichResult, ParsedResume, ProfileAnswer } from "@/lib/cv/types";
import type { AtsReadiness } from "@/lib/ats/checks";

export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("network");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(body.error ?? "server_error");
  }
  return res;
}

export async function parseResume(file: File): Promise<ParsedResume> {
  const form = new FormData();
  form.append("file", file);
  return (await request("/api/cv/parse", { method: "POST", body: form })).json();
}

export async function fetchOffer(url: string): Promise<{ text: string }> {
  return (
    await request("/api/offer/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    })
  ).json();
}

export async function analyzeResume(locale: string, resume: ParsedResume, offerText: string): Promise<AnalysisResult> {
  return (
    await request("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        offerText,
        resume: { blocks: resume.blocks, structure: resume.structure },
      }),
    })
  ).json();
}

export async function enrichProfile(
  locale: string,
  resume: ParsedResume,
  offerTitle: string,
  current: Record<string, string>,
  answers: ProfileAnswer[],
): Promise<EnrichResult> {
  return (
    await request("/api/profile/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale,
        offerTitle,
        current,
        answers,
        resume: { blocks: resume.blocks, structure: resume.structure },
      }),
    })
  ).json();
}

export async function exportResume(
  format: "pdf" | "docx",
  file: File,
  resume: ParsedResume,
  accepted: Record<string, string>,
  template = "original",
  layout: "compact" | "detailed" = "compact",
): Promise<{ blob: Blob; pages: number | null; ats: AtsReadiness | null }> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ format, template, layout, resume, accepted }));
  if (resume.format === "docx") form.append("file", file);
  const res = await request("/api/export", { method: "POST", body: form });
  const pages = Number(res.headers.get("x-cv-pages")) || null;
  let ats: AtsReadiness | null = null;
  try {
    const raw = res.headers.get("x-cv-ats");
    if (raw) ats = JSON.parse(decodeURIComponent(raw));
  } catch {}
  return { blob: await res.blob(), pages, ats };
}
