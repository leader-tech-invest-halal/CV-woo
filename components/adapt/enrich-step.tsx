"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, LoaderCircle, Sparkles, Undo2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AnalysisResult, ParsedResume, ProfileAnswer, SkillImportance, SkillMatch } from "@/lib/cv/types";
import { StepShell } from "./analysis-step";

// Étape « Enrichir mon profil » : une compétence absente du CV n'est pas forcément une compétence
// que la personne n'a pas. On lui pose la question, sans jamais répondre à sa place.

export type Choice = "yes" | "similar" | "no";
export type Draft = {
  answer: Choice | null;
  entryId: string; // "" = non précisé, "other" = ailleurs
  context: string;
  duration: string;
  example: string;
  similar: string;
};

const MAX_QUESTIONS = 8;
const RANK: Record<SkillImportance, number> = { required: 0, nice: 1, keyword: 2 };

/** Compétences à demander : absentes ou peu démontrées, les plus importantes d'abord, en nombre limité. */
export function enrichCandidates(result: AnalysisResult): SkillMatch[] {
  return result.matches
    .filter((m) => m.status === "missing" || m.status === "weak")
    .sort((a, b) => RANK[a.importance] - RANK[b.importance] || (a.status === b.status ? 0 : a.status === "missing" ? -1 : 1))
    .slice(0, MAX_QUESTIONS);
}

/** Expérience ou formation qui contient un bloc donné (pour pré-remplir « Où ? »). */
function entryOf(resume: ParsedResume, blockId: string | null): string {
  if (!blockId) return "";
  for (const s of resume.structure.sections) {
    for (const e of s.entries) {
      if (e.headerBlockIds[0] && [...e.headerBlockIds, ...e.bulletBlockIds].includes(blockId)) return e.headerBlockIds[0];
    }
  }
  return "";
}

export function emptyDraft(resume: ParsedResume, m: SkillMatch): Draft {
  return { answer: null, entryId: entryOf(resume, m.evidenceBlockId), context: "", duration: "", example: "", similar: "" };
}

/** Réponses envoyées au serveur : uniquement « oui » et « expérience similaire », champs vides retirés. */
export function toAnswers(drafts: Record<string, Draft>): ProfileAnswer[] {
  return Object.entries(drafts)
    .filter(([, d]) => d.answer === "yes" || d.answer === "similar")
    .map(([skill, d]) => ({
      skill,
      answer: d.answer as "yes" | "similar",
      entryId: d.entryId && d.entryId !== "other" ? d.entryId : null,
      context: d.entryId === "other" ? d.context.trim() || undefined : undefined,
      duration: d.duration.trim() || undefined,
      example: d.example.trim() || undefined,
      similar: d.answer === "similar" ? d.similar.trim() || undefined : undefined,
    }));
}

export function EnrichStep({
  result,
  resume,
  drafts,
  onDraft,
  busy,
  integrated,
  onIntegrate,
  onUndo,
  onBack,
  onNext,
}: {
  result: AnalysisResult;
  resume: ParsedResume;
  drafts: Record<string, Draft>;
  onDraft: (skill: string, draft: Draft) => void;
  busy: boolean;
  /** Nombre de propositions déjà ajoutées d'après les réponses (null = pas encore intégré). */
  integrated: number | null;
  onIntegrate: () => void;
  onUndo: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("adapt.flow.enrich");
  const candidates = useMemo(() => enrichCandidates(result), [result]);
  const text = (id: string) => resume.blocks.find((b) => b.id === id)?.text ?? "";

  // Expériences, formations et projets du CV, pour situer une compétence
  const places = resume.structure.sections
    .filter((s) => s.kind !== "skills" && s.kind !== "languages")
    .flatMap((s) => s.entries.filter((e) => e.headerBlockIds[0]).map((e) => ({ id: e.headerBlockIds[0], label: text(e.headerBlockIds[0]) })))
    .filter((p) => p.label);

  const confirmed = Object.values(drafts).filter((d) => d.answer === "yes" || d.answer === "similar").length;

  if (candidates.length === 0) {
    return (
      <StepShell title={t("title")} hint={t("noneHint")} onBack={onBack} onNext={onNext} nextLabel={t("next")}>
        <Card className="p-6 text-sm text-muted-foreground">{t("none")}</Card>
      </StepShell>
    );
  }

  return (
    <StepShell title={t("title")} hint={t("hint")}>
      <Card className="p-6">
        <h3 className="font-semibold">{t("question")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("reassure")}</p>

        <ul className="mt-5 space-y-3">
          {candidates.map((m) => {
            const d = drafts[m.skill] ?? emptyDraft(resume, m);
            const set = (patch: Partial<Draft>) => onDraft(m.skill, { ...d, ...patch });
            const open = d.answer === "yes" || d.answer === "similar";
            const fieldId = (k: string) => `enrich-${k}-${m.skill.replace(/\W+/g, "-")}`;
            return (
              <li key={m.skill} className={`rounded-lg border p-4 ${open ? "border-primary/40 bg-accent/30" : "border-border"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{m.skill}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`importance.${m.importance}`)} · {m.status === "weak" ? t("weak") : t("missing")}
                    </p>
                  </div>
                  <div role="radiogroup" aria-label={m.skill} className="flex flex-wrap gap-1.5">
                    {(["yes", "similar", "no"] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={d.answer === c}
                        onClick={() => set({ answer: d.answer === c ? null : c })}
                        className={`min-h-9 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                          d.answer === c
                            ? c === "no"
                              ? "border-foreground/30 bg-muted"
                              : "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:bg-muted/60"
                        }`}
                      >
                        {t(`choice.${c}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {open && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {d.answer === "similar" && (
                      <label className="block text-sm sm:col-span-2" htmlFor={fieldId("similar")}>
                        <span className="font-medium">{t("similarLabel")}</span>
                        <input
                          id={fieldId("similar")}
                          value={d.similar}
                          maxLength={300}
                          onChange={(e) => set({ similar: e.target.value })}
                          placeholder={t("similarPlaceholder")}
                          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
                        />
                      </label>
                    )}
                    <label className="block text-sm" htmlFor={fieldId("where")}>
                      <span className="font-medium">{t("whereLabel")}</span> <span className="text-muted-foreground">{t("optional")}</span>
                      <select
                        id={fieldId("where")}
                        value={d.entryId}
                        onChange={(e) => set({ entryId: e.target.value })}
                        className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
                      >
                        <option value="">{t("whereUnset")}</option>
                        {places.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                        <option value="other">{t("whereOther")}</option>
                      </select>
                    </label>
                    {d.entryId === "other" ? (
                      <label className="block text-sm" htmlFor={fieldId("context")}>
                        <span className="font-medium">{t("contextLabel")}</span>
                        <input
                          id={fieldId("context")}
                          value={d.context}
                          maxLength={300}
                          onChange={(e) => set({ context: e.target.value })}
                          placeholder={t("contextPlaceholder")}
                          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
                        />
                      </label>
                    ) : (
                      <label className="block text-sm" htmlFor={fieldId("duration")}>
                        <span className="font-medium">{t("durationLabel")}</span> <span className="text-muted-foreground">{t("optional")}</span>
                        <input
                          id={fieldId("duration")}
                          value={d.duration}
                          maxLength={80}
                          onChange={(e) => set({ duration: e.target.value })}
                          placeholder={t("durationPlaceholder")}
                          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
                        />
                      </label>
                    )}
                    <label className="block text-sm sm:col-span-2" htmlFor={fieldId("example")}>
                      <span className="font-medium">{t("exampleLabel")}</span> <span className="text-muted-foreground">{t("optional")}</span>
                      <textarea
                        id={fieldId("example")}
                        value={d.example}
                        maxLength={600}
                        rows={2}
                        onChange={(e) => set({ example: e.target.value })}
                        placeholder={t("examplePlaceholder")}
                        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {integrated !== null && (
          <div className="mt-5 flex flex-col gap-3 rounded-lg border border-primary/25 bg-accent p-4 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>{t("integrated", { count: integrated })}</p>
            <button type="button" className={buttonClass("outline", "md", "shrink-0")} onClick={onUndo}>
              <Undo2 className="size-4" strokeWidth={1.75} aria-hidden />
              {t("undo")}
            </button>
          </div>
        )}
      </Card>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
        <button type="button" className={buttonClass("ghost")} onClick={onBack} disabled={busy}>
          {t("back")}
        </button>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" className={buttonClass("outline")} onClick={onNext} disabled={busy}>
            {integrated !== null ? t("next") : t("skip")}
          </button>
          <button type="button" className={buttonClass("primary")} onClick={onIntegrate} disabled={busy || confirmed === 0}>
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />}
            {busy ? t("integrating") : t("integrate", { count: confirmed })}
            {!busy && <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />}
          </button>
        </div>
      </div>
    </StepShell>
  );
}
