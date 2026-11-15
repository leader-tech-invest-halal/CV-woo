"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, CircleAlert, CircleCheck, CircleX, ScanText } from "lucide-react";
import type { AtsReadiness } from "@/lib/ats/checks";
import { useCheckMessage } from "@/components/ats/check-message";

// Lisibilité par les logiciels de recrutement : CV d'origine, puis fichier qui sera téléchargé.
// Calculé par le code, sans IA : mêmes règles que le vérificateur ATS gratuit.

export function AtsCompare({ before, after }: { before: AtsReadiness | null | undefined; after: AtsReadiness | null }) {
  const t = useTranslations("adapt.preview.ats");
  const ta = useTranslations("ats");
  const message = useCheckMessage();

  if (!after) {
    return <p className="text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const previous = new Map((before?.checks ?? []).map((c) => [c.id, c.status]));
  const improved = after.checks.filter((c) => c.status === "pass" && previous.has(c.id) && previous.get(c.id) !== "pass");
  const remaining = after.checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === "fail" ? -1 : 1));

  const tone = (score: number) => (score >= 80 ? "text-primary" : score >= 60 ? "text-warning" : "text-destructive");

  return (
    <div>
      <div className="flex items-center gap-2">
        <ScanText className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
        <p className="text-sm font-medium">{t("title")}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3" aria-live="polite">
        {before && (
          <>
            <div className="rounded-lg border border-border px-4 py-2 text-center">
              <p className="text-xs text-muted-foreground">{t("before")}</p>
              <p className={`text-2xl font-semibold tabular-nums ${tone(before.score)}`}>
                {before.score}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </p>
            </div>
            <ArrowRight className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </>
        )}
        <div className="rounded-lg border border-primary/40 bg-accent/40 px-4 py-2 text-center">
          <p className="text-xs text-muted-foreground">{before ? t("after") : t("score")}</p>
          <p className={`text-2xl font-semibold tabular-nums ${tone(after.score)}`}>
            {after.score}
            <span className="text-sm font-normal text-muted-foreground">/100</span>
          </p>
        </div>
      </div>

      {improved.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">{t("improved")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {improved.map((c) => (
              <li
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground"
              >
                <CircleCheck className="size-3.5" strokeWidth={2} aria-hidden />
                {ta(`checks.${c.id}.title`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {remaining.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <CircleCheck className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
          {t("allGood")}
        </p>
      ) : (
        <div className="mt-4">
          <p className="text-sm font-medium">{t("remaining")}</p>
          <ul className="mt-2 space-y-2">
            {remaining.map((c) => {
              const Icon = c.status === "warn" ? CircleAlert : CircleX;
              return (
                <li key={c.id} className="flex gap-2 text-sm">
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${c.status === "warn" ? "text-warning" : "text-destructive"}`}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span>
                    <span className="font-medium">{ta(`checks.${c.id}.title`)} : </span>
                    <span className="text-muted-foreground">{message(c)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}
