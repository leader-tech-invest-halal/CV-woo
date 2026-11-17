"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, LoaderCircle, Sparkles, Undo2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  AnalysisResult,
  ParsedResume,
  ProfileAnswer,
  ProfileFigure,
  SkillImportance,
  SkillMatch,
} from "@/lib/cv/types";
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
const RANK: Record<SkillImportance, number> = {
  required: 0,
  nice: 1,
  keyword: 2,
};

/** Compétences à demander : absentes ou peu démontrées, les plus importantes d'abord, en nombre limité. */
export function enrichCandidates(result: AnalysisResult): SkillMatch[] {
  return result.matches
    .filter((m) => m.status === "missing" || m.status === "weak")
    .sort(
      (a, b) =>
        RANK[a.importance] - RANK[b.importance] ||
        (a.status === b.status ? 0 : a.status === "missing" ? -1 : 1),
    )
    .slice(0, MAX_QUESTIONS);
}

/** Expérience ou formation qui contient un bloc donné (pour pré-remplir « Où ? »). */
function entryOf(resume: ParsedResume, blockId: string | null): string {
  if (!blockId) return "";
  for (const s of resume.structure.sections) {
    for (const e of s.entries) {
      if (
        e.headerBlockIds[0] &&
        [...e.headerBlockIds, ...e.bulletBlockIds].includes(blockId)
      )
        return e.headerBlockIds[0];
    }
  }
  return "";
}

export function emptyDraft(resume: ParsedResume, m: SkillMatch): Draft {
  return {
    answer: null,
    entryId: entryOf(resume, m.evidenceBlockId),
    context: "",
    duration: "",
    example: "",
    similar: "",
  };
}

/** Réponses envoyées au serveur : uniquement « oui » et « expérience similaire », champs vides retirés. */
export function toAnswers(drafts: Record<string, Draft>): ProfileAnswer[] {
  return Object.entries(drafts)
    .filter(([, d]) => d.answer === "yes" || d.answer === "similar")
    .map(([skill, d]) => ({
      skill,
      answer: d.answer as "yes" | "similar",
      entryId: d.entryId && d.entryId !== "other" ? d.entryId : null,
      context:
        d.entryId === "other" ? d.context.trim() || undefined : undefined,
      duration: d.duration.trim() || undefined,
      example: d.example.trim() || undefined,
      similar:
        d.answer === "similar" ? d.similar.trim() || undefined : undefined,
    }));
}

/** Expériences principales pour lesquelles on demande un chiffre réel (3 au plus, dans l'ordre du CV). */
export function figureEntries(
  resume: ParsedResume,
): { id: string; label: string }[] {
  const text = (id: string) =>
    resume.blocks.find((b) => b.id === id)?.text ?? "";
  const pick = (kinds: string[]) =>
    resume.structure.sections
      .filter((s) => kinds.includes(s.kind))
      .flatMap((s) => s.entries)
      .filter((e) => e.headerBlockIds[0] && e.bulletBlockIds.length > 0)
      .map((e) => ({
        id: e.headerBlockIds[0],
        label: e.headerBlockIds.map(text).filter(Boolean).join(" · "),
      }))
      .filter((e) => e.label);
  const main = pick(["experience"]);
  return (main.length ? main : pick(["projects", "other"])).slice(0, 3);
}

/** Chiffres envoyés au serveur : seulement ceux qui contiennent vraiment un nombre. */
export function toFigures(figures: Record<string, string>): ProfileFigure[] {
  return Object.entries(figures)
    .map(([entryId, text]) => ({ entryId, text: text.trim().slice(0, 200) }))
    .filter((f) => /[0-9]/.test(f.text));
}

export function EnrichStep({
  result,
  resume,
  drafts,
  onDraft,
  figures,
  onFigure,
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
  figures: Record<string, string>;
  onFigure: (entryId: string, text: string) => void;
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
  const text = (id: string) =>
    resume.blocks.find((b) => b.id === id)?.text ?? "";

  // Expériences, formations et projets du CV, pour situer une compétence
  const places = resume.structure.sections
    .filter((s) => s.kind !== "skills" && s.kind !== "languages")
    .flatMap((s) =>
      s.entries
        .filter((e) => e.headerBlockIds[0])
        .map((e) => ({
          id: e.headerBlockIds[0],
          label: text(e.headerBlockIds[0]),
        })),
    )
    .filter((p) => p.label);

  const confirmed = Object.values(drafts).filter(
    (d) => d.answer === "yes" || d.answer === "similar",
  ).length;
  const figurePlaces = useMemo(() => figureEntries(resume), [resume]);
  const figureCount = toFigures(figures).length;
  const total = confirmed + figureCount;

  if (candidates.length === 0 && figurePlaces.length === 0) {
    return (
      <StepShell
        title={t("title")}
        hint={t("noneHint")}
        onBack={onBack}
        onNext={onNext}
        nextLabel={t("next")}
      >
        <Card className="p-6 text-sm text-muted-foreground">{t("none")}</Card>
      </StepShell>
    );
  }

  return (
    <StepShell title={t("title")} hint={t("hint")}>
      {candidates.length > 0 && (
        <Card className="p-4 sm:p-6">
          <h3 className="font-semibold">{t("question")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("reassure")}</p>

          {/* Une case par compétence : cochée = « je l'ai ». Rien n'est coché à l'avance.
            Deux questions utiles seulement, facultatives : dans quelle expérience la placer (déjà
            remplie quand le CV le dit) et un exemple concret pour bien la formuler. */}
          <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
            {candidates.map((m) => {
              const d = drafts[m.skill] ?? emptyDraft(resume, m);
              const set = (patch: Partial<Draft>) =>
                onDraft(m.skill, { ...d, ...patch });
              const checked = d.answer === "yes";
              const id = `enrich-${m.skill.replace(/\W+/g, "-")}`;
              return (
                <li
                  key={m.skill}
                  className={`p-4 transition-colors ${checked ? "bg-accent/30" : ""}`}
                >
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-start gap-3"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        set({ answer: e.target.checked ? "yes" : null })
                      }
                      className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <span>
                      <span className="block font-medium">{m.skill}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`importance.${m.importance}`)} ·{" "}
                        {m.status === "weak" ? t("weak") : t("missing")}
                      </span>
                    </span>
                  </label>
                  {checked && (
                    <div className="mt-3 grid gap-3 pl-8 sm:grid-cols-2">
                      {places.length > 0 && (
                        <label
                          className="block text-sm"
                          htmlFor={`${id}-where`}
                        >
                          <span className="font-medium">{t("whereLabel")}</span>{" "}
                          <span className="text-muted-foreground">
                            {t("optional")}
                          </span>
                          <select
                            id={`${id}-where`}
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
                          </select>
                        </label>
                      )}
                      <label
                        className="block text-sm"
                        htmlFor={`${id}-example`}
                      >
                        <span className="font-medium">{t("exampleLabel")}</span>{" "}
                        <span className="text-muted-foreground">
                          {t("optional")}
                        </span>
                        <input
                          id={`${id}-example`}
                          value={d.example}
                          maxLength={300}
                          onChange={(e) => set({ example: e.target.value })}
                          placeholder={t("examplePlaceholder")}
                          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
                        />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Chiffres réels : un CV chiffré obtient plus d'entretiens, mais seul le candidat connaît ses chiffres.
          On les demande ; l'IA ne les invente jamais. */}
      {figurePlaces.length > 0 && (
        <Card className="p-4 sm:p-6">
          <h3 className="font-semibold">{t("figures.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("figures.hint")}
          </p>
          <div className="mt-4 grid gap-4">
            {figurePlaces.map((p) => (
              <label
                key={p.id}
                className="block text-sm"
                htmlFor={`figure-${p.id}`}
              >
                <span className="font-medium">{p.label}</span>{" "}
                <span className="text-muted-foreground">{t("optional")}</span>
                <input
                  id={`figure-${p.id}`}
                  value={figures[p.id] ?? ""}
                  maxLength={200}
                  onChange={(e) => onFigure(p.id, e.target.value)}
                  placeholder={t("figures.placeholder")}
                  className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"
                />
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("figures.note")}
          </p>
        </Card>
      )}

      {integrated !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-accent p-4 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("integrated", { count: integrated })}</p>
          <button
            type="button"
            className={buttonClass("outline", "md", "shrink-0")}
            onClick={onUndo}
          >
            <Undo2 className="size-4" strokeWidth={1.75} aria-hidden />
            {t("undo")}
          </button>
        </div>
      )}

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <button
          type="button"
          className={buttonClass("ghost")}
          onClick={onBack}
          disabled={busy}
        >
          {t("back")}
        </button>
        <div className="flex flex-1 flex-wrap justify-end gap-2 md:flex-none md:gap-3">
          <button
            type="button"
            className={buttonClass("outline")}
            onClick={onNext}
            disabled={busy}
          >
            {integrated !== null ? t("next") : t("skip")}
          </button>
          <button
            type="button"
            className={buttonClass("primary")}
            onClick={onIntegrate}
            disabled={busy || total === 0}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            )}
            {busy ? t("integrating") : t("integrate", { count: total })}
            {!busy && (
              <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </StepShell>
  );
}
