"use client";

import { createClient } from "@/lib/supabase/client";
import type { ParsedResume } from "@/lib/cv/types";
import type { LayoutMode } from "@/lib/export/layout";
import type { TemplateId } from "@/lib/export/templates";

// Historique des CV adaptés (facultatif, comptes connectés). Seuls le texte du CV, les
// modifications acceptées et les réglages sont gardés : les fichiers sont recréés à la demande.
// L'accès est limité par la base (RLS) : chacun ne voit et ne supprime que ses propres CV.

export type HistoryEntry = {
  id: string;
  offer_title: string;
  company: string | null;
  score: number | null;
  file_name: string;
  template: TemplateId;
  layout: LayoutMode;
  created_at: string;
  expires_at: string;
};

export type HistoryMeta = { offerTitle: string; company: string | null; score: number | null };

export async function saveToHistory(
  meta: HistoryMeta,
  resume: ParsedResume,
  accepted: Record<string, string>,
  template: TemplateId,
  layout: LayoutMode,
): Promise<{ ok: true } | { ok: false; code: "history_full" | "not_signed_in" | "unknown" }> {
  const supabase = createClient();
  const { error } = await supabase.from("cv_history").insert({
    offer_title: meta.offerTitle.slice(0, 300) || "CV",
    company: meta.company?.slice(0, 200) ?? null,
    score: meta.score,
    file_name: resume.fileName.slice(0, 300) || "cv",
    template,
    layout,
    // Le texte et la structure du CV, sans le fichier d'origine ni l'analyse ATS
    resume: { format: resume.format, fileName: resume.fileName, blocks: resume.blocks, structure: resume.structure, style: resume.style },
    accepted,
  });
  if (!error) return { ok: true };
  if (/history_full/.test(error.message)) return { ok: false, code: "history_full" };
  if (error.code === "42501") return { ok: false, code: "not_signed_in" };
  return { ok: false, code: "unknown" };
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const { data, error } = await createClient()
    .from("cv_history")
    .select("id, offer_title, company, score, file_name, template, layout, created_at, expires_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as HistoryEntry[];
}

/** Données complètes d'une entrée, pour recréer le PDF ou le Word. */
export async function loadHistoryEntry(id: string): Promise<{ resume: ParsedResume; accepted: Record<string, string> }> {
  const { data, error } = await createClient().from("cv_history").select("resume, accepted").eq("id", id).single();
  if (error) throw error;
  return data as { resume: ParsedResume; accepted: Record<string, string> };
}

export async function deleteHistoryEntry(id: string) {
  const { error } = await createClient().from("cv_history").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllHistory() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase.from("cv_history").delete().eq("user_id", data.user.id);
  if (error) throw error;
}
