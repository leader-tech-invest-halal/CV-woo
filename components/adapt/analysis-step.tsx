"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CircleAlert, CircleCheck, CircleMinus, LoaderCircle, Pencil } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScoreGauge } from "@/components/analysis/score-gauge";
import { SkillChip } from "@/components/analysis/skill-chip";
import type { AnalysisResult, ParsedResume, Rewrite, SkillImportance, SkillStatus } from "@/lib/cv/types";
import { NEW_HEADLINE_ID, NEW_SECTION_IDS } from "@/lib/cv/compose";

/**
 * Origine d'une phrase dans le CV : rubrique + expérience (ex. « Expérience professionnelle ·
 * Chargée de communication — Association Envol »), pour savoir d'où vient chaque reformulation.
 */
export function useOrigin(resume: ParsedResume) {
  const t = useTranslations("adapt.flow.changes");
  const text = (id: string | null | undefined) => (id ? resume.blocks.find((b) => b.id === id)?.text ?? "" : "");
  return (blockId: string): string | null => {
    const s = resume.structure;
    if (blockId === s.headlineBlockId || blockId === NEW_HEADLINE_ID) return t("headline");
    if (blockId === NEW_SECTION_IDS.availability) return t("newAvailability");
    if (blockId === NEW_SECTION_IDS.qualities) return t("newQualities");
    if (blockId === s.nameBlockId || (s.nameExtraBlockIds ?? []).includes(blockId)) return t("name");
    if (s.contactBlockIds.includes(blockId)) return t("contacts");
    if (s.summaryBlockIds.includes(blockId)) return t("summary");
    for (const section of s.sections) {
      for (const entry of section.entries) {
        if (entry.bulletBlockIds.includes(blockId) || entry.headerBlockIds.includes(blockId)) {
          const heading = section.headingBlockId ? text(section.headingBlockId) : section.heading;
          const header = text(entry.headerBlockIds[0]);
          return header ? `${heading} · ${header}` : heading;
        }
      }
    }
    return null;
  };
}

// Écrans 3 à 6 du parcours : exigences de l'offre, comparaison avec le CV,
// propositions (accepter / refuser / modifier) et validation avant génération.

export type StepState = "done" | "active" | "pending";

/**
 * Liste d'étapes qui reflète l'état RÉEL du traitement : une étape n'est cochée que lorsque
 * l'opération correspondante est terminée (aucune progression simulée par un minuteur).
 */
export function ProgressSteps({ steps, elapsed }: { steps: { label: string; state: StepState }[]; elapsed?: number }) {
  const t = useTranslations("adapt.analyzing");
  return (
    <div role="status" aria-live="polite">
      <ol className="space-y-3">
        {steps.map(({ label, state }, i) => (
          <li key={i} className={`flex items-center gap-3 text-sm ${state === "pending" ? "text-muted-foreground" : ""}`}>
            {state === "done" ? (
              <CircleCheck className="size-5 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
            ) : state === "active" ? (
              <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" strokeWidth={1.5} aria-hidden />
            ) : (
              <span className="size-5 shrink-0 rounded-full border border-border" aria-hidden />
            )}
            <span>
              {label}
              <span className="sr-only"> : {t(`state.${state}`)}</span>
            </span>
          </li>
        ))}
      </ol>
      {elapsed !== undefined && <p className="mt-5 text-center text-xs text-muted-foreground tabular-nums">{t("elapsed", { seconds: elapsed })}</p>}
    </div>
  );
}

/** Écran d'attente pendant l'analyse par l'IA : étapes réelles du parcours et temps écoulé. */
export function Analyzing() {
  const t = useTranslations("adapt.analyzing");
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  // Lecture du fichier et rubriques : faites à l'import. Analyse : en cours (la requête est envoyée).
  // Mise en page et aperçu : se feront à l'étape Téléchargement.
  return (
    <Card className="px-6 py-12" aria-busy="true">
      <div className="mx-auto max-w-sm">
        <h2 className="mb-6 text-center text-lg font-semibold">{t("title")}</h2>
        <ProgressSteps
          elapsed={elapsed}
          steps={[
            { label: t("read"), state: "done" },
            { label: t("sections"), state: "done" },
            { label: t("analysis"), state: "active" },
            { label: t("layout"), state: "pending" },
            { label: t("preview"), state: "pending" },
          ]}
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">{t("hint")}</p>
      </div>
    </Card>
  );
}

/** Cadre commun des écrans du parcours : titre, consigne, contenu, boutons Retour / Suivant. */
export function StepShell({
  title,
  hint,
  children,
  onBack,
  backLabel,
  onNext,
  nextLabel,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const t = useTranslations("adapt.flow");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
      {(onBack || onNext) && (
        // Sur téléphone : boutons toujours visibles en bas de l'écran, sans devoir tout faire défiler
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          {onBack ? (
            <button type="button" className={buttonClass("ghost")} onClick={onBack}>
              {backLabel ?? t("back")}
            </button>
          ) : (
            <span />
          )}
          {onNext && (
            <button type="button" className={buttonClass("primary", "md", "flex-1 md:flex-none")} onClick={onNext}>
              {nextLabel}
              <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Étape 3 — Ce que recherche le recruteur. */
export function RequirementsStep({ result, onBack, onNext }: { result: AnalysisResult; onBack: () => void; onNext: () => void }) {
  const t = useTranslations("adapt.flow.requirements");
  const groups: SkillImportance[] = ["required", "nice", "keyword"];
  return (
    <StepShell title={t("title")} hint={t("hint")} onBack={onBack} onNext={onNext} nextLabel={t("next")}>
      <Card className="p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">{result.offer.company ?? ""}</p>
        <h3 className="text-lg font-semibold">{result.offer.title}</h3>
        {/* Conditions impératives (horaires, lieu, contrat…) : ce qui élimine d'office si elles manquent */}
        {!!result.offer.conditions?.length && (
          <div className="mt-4 rounded-lg border border-primary/25 bg-accent/40 p-3">
            <p className="mb-2 text-xs font-semibold tracking-wide text-accent-foreground uppercase">{t("conditions")}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {result.offer.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {result.matches.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="mt-5 space-y-5">
            {groups.map((g) => {
              const items = result.matches.filter((m) => m.importance === g);
              if (!items.length) return null;
              return (
                <div key={g}>
                  <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(g)} ({items.length})
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {items.map((m) => (
                      <li key={m.skill} className="rounded-full border border-border bg-background px-3 py-1 text-sm">
                        {m.skill}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {!!result.offer.qualities?.length && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("qualities")}</p>
            <ul className="flex flex-wrap gap-1.5">
              {result.offer.qualities.map((q) => (
                <li key={q} className="rounded-full border border-border bg-background px-3 py-1 text-sm">
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </StepShell>
  );
}

/** Étape 4 — Comparaison : ce que le CV prouve, avec la phrase-preuve. */
export function CompareStep({ result, onBack, onNext }: { result: AnalysisResult; onBack: () => void; onNext: () => void }) {
  const t = useTranslations("adapt.flow.compare");
  const ta = useTranslations("adapt.analysis");
  const order: SkillStatus[] = ["present", "weak", "missing"];
  const icons = { present: CircleCheck, weak: CircleAlert, missing: CircleMinus };
  const colors = { present: "text-primary", weak: "text-warning", missing: "text-muted-foreground" };

  return (
    <StepShell title={t("title")} hint={t("hint")} onBack={onBack} onNext={onNext} nextLabel={t("next")}>
      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <ScoreGauge value={result.score} label={ta("score")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-relaxed">{result.feedback}</p>
          <p className="mt-2 text-xs text-muted-foreground">{ta("disclaimer")}</p>
        </div>
      </Card>

      {order.map((status) => {
        const items = result.matches.filter((m) => m.status === status);
        if (!items.length) return null;
        const Icon = icons[status];
        return (
          <Card key={status} className="p-6">
            <h3 className="font-semibold">
              {ta(status)} <span className="font-normal text-muted-foreground">({items.length})</span>
            </h3>
            <ul className="mt-4 divide-y divide-border">
              {items.map((m) => (
                <li key={m.skill} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <Icon className={`mt-0.5 size-5 shrink-0 ${colors[status]}`} strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {m.skill}
                      {m.importance === "required" && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                          {ta("required")}
                        </span>
                      )}
                    </p>
                    {m.evidenceQuote && (
                      <p className="mt-1 text-muted-foreground">
                        {t("proof")} <q className="text-foreground">{m.evidenceQuote}</q>
                      </p>
                    )}
                    {m.advice && (
                      <p className="mt-1 text-muted-foreground">
                        {t("advice")} {m.advice}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </StepShell>
  );
}

/** Étape 5 — Propositions : accepter, refuser ou modifier chaque phrase. */
export function ChangesStep({
  result,
  resume,
  accepted,
  onToggle,
  onSetAll,
  edits,
  onEdit,
  unplaced = [],
  onBack,
  onNext,
}: {
  result: AnalysisResult;
  resume: ParsedResume;
  accepted: Record<string, boolean>;
  onToggle: (blockId: string) => void;
  /** Tout accepter (sauf les propositions à vérifier) ou tout refuser. */
  onSetAll: (accept: boolean) => void;
  edits: Record<string, string>;
  onEdit: (blockId: string, text: string) => void;
  /** Compétences confirmées que l'IA n'a pu placer dans aucun bloc. */
  unplaced?: string[];
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("adapt.flow.changes");
  const ta = useTranslations("adapt.analysis");
  const count = result.rewrites.filter((r) => accepted[r.blockId]).length;
  const origin = useOrigin(resume);
  const hasFlagged = result.rewrites.some((r) => r.flags.length > 0);

  return (
    <StepShell title={t("title")} hint={t("hint")} onBack={onBack} onNext={onNext} nextLabel={t("next")}>
      {unplaced.length > 0 && (
        <p className="rounded-lg border border-border bg-muted/50 p-4 text-sm">{t("unplaced", { skills: unplaced.join(", ") })}</p>
      )}
      {/* Remarques de l'IA : ce qu'elle conseille sans le modifier elle-même (ordre, information manquante…) */}
      {!!result.remarks?.length && (
        <Card className="p-4 sm:p-6">
          <p className="text-sm font-semibold">{t("remarks")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {result.remarks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="p-4 sm:p-6">
        {result.rewrites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ta("noChanges")}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium tabular-nums">{ta("accepted", { count, total: result.rewrites.length })}</p>
              <div className="flex gap-2">
                <button type="button" className={buttonClass("outline", "md", "flex-1 sm:flex-none")} onClick={() => onSetAll(true)}>
                  {t("acceptAll")}
                </button>
                <button type="button" className={buttonClass("ghost", "md", "flex-1 sm:flex-none")} onClick={() => onSetAll(false)}>
                  {t("rejectAll")}
                </button>
              </div>
            </div>
            {hasFlagged && <p className="mt-2 text-xs text-muted-foreground">{t("acceptAllHint")}</p>}
            <ul className="mt-5 space-y-3">
              {result.rewrites.map((r) => (
                <RewriteCard
                  key={r.blockId}
                  origin={origin(r.blockId)}
                  rewrite={r}
                  on={!!accepted[r.blockId]}
                  edit={edits[r.blockId]}
                  onToggle={() => onToggle(r.blockId)}
                  onEdit={(text) => onEdit(r.blockId, text)}
                />
              ))}
            </ul>
          </>
        )}
      </Card>
    </StepShell>
  );
}

function RewriteCard({
  rewrite: r,
  origin,
  on,
  edit,
  onToggle,
  onEdit,
}: {
  rewrite: Rewrite;
  origin: string | null;
  on: boolean;
  edit: string | undefined;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const t = useTranslations("adapt.analysis");
  const tc = useTranslations("adapt.flow.changes");
  return (
    <li className={`rounded-lg border p-3 transition-colors sm:p-4 ${on ? "border-primary/40 bg-accent/30" : "border-border"}`}>
      <div className="flex gap-2.5 sm:gap-3">
        <input type="checkbox" checked={on} aria-label={r.after} onChange={onToggle} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
        <div className="min-w-0 flex-1 space-y-3 text-sm">
          {(origin || r.source === "profile") && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {r.source === "profile" && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                  {tc("fromProfile")}
                </span>
              )}
              {origin && (
                <span>
                  <span className="font-medium">{tc("origin")}</span> {origin}
                </span>
              )}
            </p>
          )}
          {/* Avant / après : côte à côte sur ordinateur, l'un sous l'autre sur mobile */}
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{tc("before")}</p>
              <p className="rounded-md bg-muted/60 px-2 py-1 text-muted-foreground">
                {r.before || <em>{r.blockId === NEW_HEADLINE_ID ? tc("noHeadline") : tc("noSection")}</em>}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wide text-accent-foreground uppercase">{tc("after")}</p>
              {r.after === "" && edit === undefined ? (
                <p className="rounded-md bg-muted/60 px-2 py-1 italic text-muted-foreground">{tc("removed")}</p>
              ) : (
                <EditableText value={edit ?? r.after} edited={edit !== undefined} onChange={onEdit} />
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{r.reason}</p>
          {r.keywords.length > 0 && (
            <p className="text-xs">
              <span className="text-muted-foreground">{t("keywords")}</span> {r.keywords.join(", ")}
            </p>
          )}
          {r.flags.length > 0 && <FlagList flags={r.flags} />}
        </div>
      </div>
    </li>
  );
}

function FlagList({ flags }: { flags: string[] }) {
  const t = useTranslations("adapt.analysis");
  return (
    <div className="rounded-md bg-warning/10 p-2 text-xs text-[oklch(0.42_0.1_60)]">
      <p className="flex items-center gap-1.5 font-medium">
        <CircleAlert className="size-3.5" strokeWidth={1.75} aria-hidden />
        {t("flagTitle")}
      </p>
      <ul className="mt-1 list-disc pl-5">
        {flags.map((f) => {
          const [kind, ...rest] = f.split(":");
          const value = rest.join(":");
          return (
            <li key={f}>
              {kind === "number" || kind === "term" || kind === "keyword" || kind === "similar" || kind === "verify" ? t(`flag.${kind}`, { value }) : f}
            </li>
          );
        })}
      </ul>
      <p className="mt-1">{t("flagHelp")}</p>
    </div>
  );
}

/** Étape 6 — Validation : récapitulatif exact de ce qui va changer. */
export function ReviewStep({
  result,
  resume,
  accepted,
  edits,
  onBack,
  onNext,
}: {
  result: AnalysisResult;
  resume: ParsedResume;
  accepted: Record<string, boolean>;
  edits: Record<string, string>;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("adapt.flow.review");
  const origin = useOrigin(resume);
  const kept = result.rewrites.filter((r) => accepted[r.blockId]);
  // Une modification signalée reste à vérifier sauf si la personne l'a réécrite elle-même
  const flagged = kept.filter((r) => r.flags.length > 0 && edits[r.blockId] === undefined);
  const missing = result.matches.filter((m) => m.status === "missing");

  return (
    <StepShell title={t("title")} hint={t("hint")} onBack={onBack} backLabel={t("back")} onNext={onNext} nextLabel={t("next")}>
      <Card className="p-4 sm:p-6">
        <p className="font-semibold">{t("count", { count: kept.length })}</p>
        {kept.length > 0 && (
          <ol className="mt-4 space-y-3">
            {kept.map((r, i) => (
              <li key={r.blockId} className="flex gap-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  {origin(r.blockId) && <p className="text-xs text-muted-foreground">{origin(r.blockId)}</p>}
                  <p>{edits[r.blockId] ?? (r.after || <em className="text-muted-foreground">{t("removed", { text: r.before })}</em>)}</p>
                  {edits[r.blockId] !== undefined && <p className="text-xs text-muted-foreground">({t("edited")})</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {flagged.length > 0 && (
          <p role="note" className="mt-4 flex gap-2 rounded-md bg-warning/10 p-3 text-sm text-[oklch(0.42_0.1_60)]">
            <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {t("flagged", { count: flagged.length })}
          </p>
        )}
      </Card>

      {missing.length > 0 && (
        <Card className="p-4 sm:p-6">
          <p className="text-sm font-medium">{t("missing")}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <SkillChip key={m.skill} state="missing">
                {m.skill}
              </SkillChip>
            ))}
          </div>
        </Card>
      )}
    </StepShell>
  );
}

/** Texte proposé par l'IA, modifiable par la personne. */
function EditableText({ value, edited, onChange }: { value: string; edited: boolean; onChange: (text: string) => void }) {
  const t = useTranslations("adapt.analysis");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 70)))}
          maxLength={2000}
          autoFocus
          className="w-full rounded-md border border-primary/40 bg-background p-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted"
          onClick={() => {
            const text = draft.replace(/\s+/g, " ").trim();
            if (text) onChange(text);
            setEditing(false);
          }}
        >
          {t("done")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:flex-row sm:gap-2">
      <p className="w-full flex-1 rounded-md bg-accent px-2 py-1 text-accent-foreground">
        {value}
        {edited && <span className="ml-2 text-xs opacity-70">({t("edited")})</span>}
      </p>
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-3.5" strokeWidth={1.75} aria-hidden />
        {t("edit")}
      </button>
    </div>
  );
}
