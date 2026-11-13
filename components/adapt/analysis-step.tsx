"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScoreGauge } from "@/components/analysis/score-gauge";
import { SkillChip } from "@/components/analysis/skill-chip";
import type { AnalysisResult, SkillStatus } from "@/lib/cv/types";

export function Analyzing() {
  const t = useTranslations("adapt.analyzing");
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, 3)), 9000);
    return () => clearInterval(id);
  }, []);
  const steps = [t("s1"), t("s2"), t("s3"), t("s4")];
  return (
    <Card className="px-6 py-12">
      <div className="mx-auto max-w-sm">
        <h2 className="text-center text-lg font-semibold">{t("title")}</h2>
        <ol className="mt-6 space-y-3">
          {steps.map((label, i) => (
            <li key={i} className={`flex items-center gap-3 text-sm ${i > step ? "text-muted-foreground" : ""}`}>
              {i < step ? (
                <CircleCheck className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
              ) : i === step ? (
                <LoaderCircle className="size-5 animate-spin text-primary" strokeWidth={1.5} aria-hidden />
              ) : (
                <span className="size-5 rounded-full border border-border" aria-hidden />
              )}
              {label}
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-xs text-muted-foreground">{t("hint")}</p>
      </div>
    </Card>
  );
}

export function AnalysisStep({
  result,
  accepted,
  onToggle,
  edits,
  onEdit,
  onBack,
  onNext,
}: {
  result: AnalysisResult;
  accepted: Record<string, boolean>;
  onToggle: (blockId: string) => void;
  edits: Record<string, string>;
  onEdit: (blockId: string, text: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("adapt.analysis");
  const groups: SkillStatus[] = ["present", "weak", "missing"];
  const count = result.rewrites.filter((r) => accepted[r.blockId]).length;
  const missing = result.matches.filter((m) => m.status === "missing");

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
        <ScoreGauge value={result.score} label={t("score")} />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{t("for")}</p>
          <h2 className="text-lg font-semibold">
            {result.offer.title}
            {result.offer.company && <span className="font-normal text-muted-foreground"> · {result.offer.company}</span>}
          </h2>
          <p className="mt-2 text-sm leading-relaxed">{result.feedback}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("disclaimer")}</p>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold">{t("skills")}</h3>
        <div className="mt-4 space-y-4">
          {groups.map((status) => {
            const items = result.matches.filter((m) => m.status === status);
            if (items.length === 0) return null;
            return (
              <div key={status}>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t(status)} ({items.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((m) => (
                    <span key={m.skill} title={m.evidenceQuote ? `${t("evidence")} « ${m.evidenceQuote} »` : (m.advice ?? undefined)}>
                      <SkillChip state={status}>{m.importance === "required" ? `${m.skill} · ${t("required")}` : m.skill}</SkillChip>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("changes")}</h3>
          {result.rewrites.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {t("accepted", { count, total: result.rewrites.length })}
            </span>
          )}
        </div>
        {result.rewrites.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("noChanges")}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{t("changesHint")}</p>
            <ul className="mt-4 space-y-3">
              {result.rewrites.map((r) => {
                const on = !!accepted[r.blockId];
                return (
                  <li key={r.blockId} className={`rounded-lg border p-4 ${on ? "border-primary/40" : "border-border"}`}>
                    <div className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={on}
                        aria-label={r.after}
                        onChange={() => onToggle(r.blockId)}
                        className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                      />
                      <div className="min-w-0 flex-1 space-y-2 text-sm">
                        <p className="text-muted-foreground line-through decoration-muted-foreground/50">{r.before}</p>
                        <EditableText
                          value={edits[r.blockId] ?? r.after}
                          edited={edits[r.blockId] !== undefined}
                          onChange={(text) => onEdit(r.blockId, text)}
                        />
                        <p className="text-xs text-muted-foreground">{r.reason}</p>
                        {r.keywords.length > 0 && (
                          <p className="text-xs">
                            <span className="text-muted-foreground">{t("keywords")}</span> {r.keywords.join(", ")}
                          </p>
                        )}
                        {r.flags.length > 0 && (
                          <div className="rounded-md bg-warning/10 p-2 text-xs text-[oklch(0.42_0.1_60)]">
                            <p className="flex items-center gap-1.5 font-medium">
                              <CircleAlert className="size-3.5" strokeWidth={1.75} aria-hidden />
                              {t("flagTitle")}
                            </p>
                            <ul className="mt-1 list-disc pl-5">
                              {r.flags.map((f) => {
                                const [kind, ...rest] = f.split(":");
                                const value = rest.join(":");
                                return (
                                  <li key={f}>
                                    {kind === "number" || kind === "term" || kind === "keyword"
                                      ? t(`flag.${kind}`, { value })
                                      : f}
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="mt-1">{t("flagHelp")}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {missing.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold">{t("missingTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("missingHint")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {missing.map((m) => (
              <li key={m.skill}>
                <span className="font-medium">{m.skill}</span>
                {m.advice && <span className="text-muted-foreground"> · {m.advice}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className={buttonClass("ghost")} onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className={buttonClass("primary")} onClick={onNext}>
          {t("next")}
        </button>
      </div>
    </div>
  );
}

/** Texte proposé par l'IA, modifiable par la personne (comme dans les éditeurs des leaders du marché). */
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
            const text = draft.replace(/s+/g, " ").trim();
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
    <div className="flex items-start gap-2">
      <p className="flex-1 rounded-md bg-accent px-2 py-1 text-accent-foreground">
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
