"use client";

import type { AnalysisResult, ParsedResume } from "@/lib/cv/types";

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

export async function exportResume(
  format: "pdf" | "docx",
  file: File,
  resume: ParsedResume,
  accepted: Record<string, string>,
  template = "original",
): Promise<Blob> {
  const form = new FormData();
  form.append("payload", JSON.stringify({ format, template, resume, accepted }));
  if (resume.format === "docx") form.append("file", file);
  return (await request("/api/export", { method: "POST", body: form })).blob();
}
