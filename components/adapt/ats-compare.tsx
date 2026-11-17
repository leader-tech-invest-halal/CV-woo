"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, CircleAlert, CircleCheck, CircleX, Info, ScanText } from "lucide-react";
import { CHECK_GROUPS, groupScores, type AtsReadiness } from "@/lib/ats/checks";
import { useCheckMessage } from "@/components/ats/check-message";

// Score ATS du CV d'origine et du fichier qui sera téléchargé, détaillé par rubrique.
// Calculé par le code, sans IA, sur le texte réellement extrait de chaque document, avec les
// mots-clés de l'offre. Jamais arrangé : s'il ne progresse pas, on explique pourquoi.

const tone = (score: number) => (score >= 80 ? "text-primary" : score >= 60 ? "text-warning" : "text-destructive");
const bar = (score: number) => (score >= 80 ? "bg-primary" : score >= 60 ? "bg-warning" : "bg-destructive");

export function AtsCompare({ before, after }: { before: AtsReadiness | null | undefined; after: AtsReadiness | null }) {
  const t = useTranslations("adapt.preview.ats");
  const ta = useTranslations("ats");
  const message = useCheckMessage();

  if (!after) return <p className="text-sm text-muted-foreground">{t("loading")}</p>;

  const previous = new Map((before?.checks ?? []).map((c) => [c.id, c.status]));
  const improved = after.checks.filter((c) => c.status === "pass" && previous.has(c.id) && previous.get(c.id) !== "pass");
  const remaining = after.checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => (a.status === b.status ? b.weight - a.weight : a.status === "fail" ? -1 : 1));
  const groupsBefore = before ? groupScores(before.checks) : null;
  const groupsAfter = groupScores(after.checks);
  const delta = before ? after.score - before.score : null;
  // Mots-clés de l'offre ajoutés par l'adaptation, et ceux qui manquent encore
  const addedKeywords = (after.keywords?.found ?? []).filter((k) => !(before?.keywords?.found ?? []).includes(k));
  const missingKeywords = after.keywords?.missing ?? [];

  // Score inchangé : on dit pourquoi, sans rien arranger
  const why =
    delta === 0
      ? addedKeywords.length === 0 && missingKeywords.length > 0
        ? t("same.keywordsMissing")
        : addedKeywords.length === 0
          ? t("same.alreadyGood")
          : t("same.balanced")
      : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <ScanText className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
        <p className="text-sm font-medium">{t("title")}</p>
      </div>

      {/* Score avant → après, et évolution */}
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
        {delta !== null && (
          <span
            className={`rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums ${
              delta > 0 ? "bg-accent text-accent-foreground" : delta < 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            }`}
          >
            {delta > 0 ? `+${delta}` : delta === 0 ? t("unchanged") : delta}
          </span>
        )}
      </div>

      {why && (
        <p className="mt-3 flex gap-2 rounded-md bg-muted/60 p-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span>{why}</span>
        </p>
      )}

      {/* Détail par rubrique */}
      <dl className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
        {Object.keys(CHECK_GROUPS)
          .filter((g) => groupsAfter[g] !== null)
          .map((g) => {
            const a = groupsAfter[g]!;
            const b = groupsBefore?.[g] ?? null;
            return (
              <div key={g} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[10rem_1fr_auto]">
                <dt className="font-medium">{t(`groups.${g}`)}</dt>
                <dd className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className={`block h-full rounded-full ${bar(a)}`} style={{ width: `${a}%` }} />
                  </span>
                </dd>
                <dd className="text-right text-xs tabular-nums text-muted-foreground">
                  {b !== null && b !== a ? (
                    <>
                      {b} % → <span className={`font-semibold ${tone(a)}`}>{a} %</span>
                    </>
                  ) : (
                    <span className={`font-semibold ${tone(a)}`}>{a} %</span>
                  )}
                </dd>
              </div>
            );
          })}
      </dl>

      {(addedKeywords.length > 0 || missingKeywords.length > 0) && (
        <div className="mt-4 space-y-2 text-sm">
          {addedKeywords.length > 0 && (
            <div>
              <p className="font-medium">{t("keywordsAdded", { count: addedKeywords.length })}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {addedKeywords.map((k) => (
                  <li key={k} className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {missingKeywords.length > 0 && (
            <div>
              <p className="font-medium">{t("keywordsMissing", { count: missingKeywords.length })}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {missingKeywords.map((k) => (
                  <li key={k} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                    {k}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-muted-foreground">{t("keywordsHint")}</p>
            </div>
          )}
        </div>
      )}

      {improved.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium">{t("improved")}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {improved.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
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
                  <Icon className={`mt-0.5 size-4 shrink-0 ${c.status === "warn" ? "text-warning" : "text-destructive"}`} strokeWidth={1.75} aria-hidden />
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
