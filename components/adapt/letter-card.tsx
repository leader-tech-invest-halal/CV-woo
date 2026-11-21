"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, Copy, Download, FileText, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CoverLetter, ParsedResume } from "@/lib/cv/types";
import { ApiError, exportLetterPdf, generateLetter } from "./api";

// Lettre de motivation, proposée après l'adaptation du CV.
// 1. Deux questions SIMPLES, facultatives : la personne coche des réponses toutes prêtes
//    (et peut ajouter un mot). Les atouts proposés reprennent les conditions de l'offre.
// 2. Un seul appel à l'IA, avec le CV adapté, l'offre et uniquement ce qui a été coché ou écrit.
// 3. La lettre s'affiche dans des champs modifiables, puis s'exporte en PDF (une page, style du CV).
// 4. Les « points à vérifier » (IA + contrôles du code) sont affichés sous la lettre.

type Step = "intro" | "questions" | "busy" | "done";
const MOTIVATIONS = ["clients", "missions", "brand", "learn", "schedule", "stability"] as const;
const ASSETS = ["near", "now", "weekend", "license", "flexible"] as const;

export function LetterCard({
  resume,
  accepted,
  template,
  offerText,
  offer,
}: {
  resume: ParsedResume;
  accepted: Record<string, string>;
  template: string;
  offerText: string;
  offer: { title: string; company: string | null; conditions: string[] };
}) {
  const t = useTranslations("adapt.letter");
  const te = useTranslations("adapt.errors");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("intro");
  const [motivations, setMotivations] = useState<string[]>([]);
  const [assets, setAssets] = useState<string[]>([]);
  const [motivationText, setMotivationText] = useState("");
  const [assetText, setAssetText] = useState("");
  const [letter, setLetter] = useState<CoverLetter | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Atouts proposés : d'abord les conditions impératives de l'offre (« Je peux : travail le samedi »),
  // puis des atouts courants. Rien n'est coché à l'avance.
  const conditionChoices = useMemo(() => offer.conditions.slice(0, 3).map((c) => t("canDo", { condition: c })), [offer.conditions, t]);
  const assetChoices = [...conditionChoices, ...ASSETS.map((a) => t(`assets.${a}`))];
  const motivationChoices = MOTIVATIONS.map((m) => t(`motivations.${m}`));

  useEffect(() => {
    if (step !== "busy") return;
    setElapsed(0);
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [step]);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const generate = async () => {
    setError(null);
    setStep("busy");
    try {
      const result = await generateLetter({
        locale,
        offerText,
        offer,
        resume,
        accepted,
        answers: {
          motivation: [...motivations, motivationText.trim()].filter(Boolean).join(" ; "),
          asset: [...assets, assetText.trim()].filter(Boolean).join(" ; "),
        },
      });
      setLetter(result);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "server_error");
      setStep("questions");
    }
  };

  const download = async () => {
    if (!letter) return;
    setDownloading(true);
    setError(null);
    try {
      const blob = await exportLetterPdf(template, resume.style, letter);
      // Lien ajouté à la page avant le clic (Firefox) et libéré plus tard (Safari sur iPhone)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${resume.fileName.replace(/\.(pdf|docx)$/i, "") || "cv"}-lettre-de-motivation.pdf`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof ApiError ? e.code : "server_error");
    } finally {
      setDownloading(false);
    }
  };

  const copy = async () => {
    if (!letter) return;
    const text = [...letter.sender, "", letter.recipient, "", letter.placeDate, "", letter.subject, "", letter.body, "", letter.signature].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // presse-papiers indisponible (navigateur intégré) : rien de plus à faire
    }
  };

  const set = (patch: Partial<CoverLetter>) => letter && setLetter({ ...letter, ...patch });
  const words = letter ? (letter.body.match(/[\p{L}\d][\p{L}\d'’-]*/gu) ?? []).length : 0;
  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const chips = (choices: string[], selected: string[], onToggle: (v: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {choices.map((c) => {
        const on = selected.includes(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(c)}
            className={`min-h-9 rounded-full border px-3 py-1 text-left text-sm transition-colors ${
              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"
            }`}
          >
            {c}
          </button>
        );
      })}
    </div>
  );

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <FileText className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle", { title: offer.title })}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
          {te.has(error) ? te(error) : te("server_error")}
        </p>
      )}

      {step === "intro" && (
        <button type="button" className={buttonClass("primary", "md", "mt-5")} onClick={() => setStep("questions")}>
          <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
          {t("start")}
        </button>
      )}

      {step === "questions" && (
        <div className="mt-5 space-y-5">
          <p className="text-sm text-muted-foreground">{t("questionsHint")}</p>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("q1")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
            </p>
            {chips(motivationChoices, motivations, (v) => toggle(motivations, setMotivations, v))}
            <input value={motivationText} maxLength={200} onChange={(e) => setMotivationText(e.target.value)} placeholder={t("q1Placeholder")} className={field} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {t("q2")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
            </p>
            {chips(assetChoices, assets, (v) => toggle(assets, setAssets, v))}
            <input value={assetText} maxLength={150} onChange={(e) => setAssetText(e.target.value)} placeholder={t("q2Placeholder")} className={field} />
          </div>
          <p className="text-xs text-muted-foreground">{t("honesty")}</p>
          <button type="button" className={buttonClass("primary")} onClick={generate}>
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            {t("generate")}
          </button>
        </div>
      )}

      {step === "busy" && (
        <div className="mt-6 flex flex-col items-center py-6 text-center" aria-live="polite">
          <LoaderCircle className="size-7 animate-spin text-primary" strokeWidth={1.5} aria-hidden />
          <p className="mt-3 font-medium">{t("writing")}</p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{t("elapsed", { seconds: elapsed })}</p>
        </div>
      )}

      {step === "done" && letter && (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-muted-foreground">{t("editHint")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">{t("recipient")}</span>
              <textarea value={letter.recipient} rows={3} onChange={(e) => set({ recipient: e.target.value })} className={`${field} mt-1`} />
            </label>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="font-medium">{t("placeDate")}</span>
                <input value={letter.placeDate} onChange={(e) => set({ placeDate: e.target.value })} className={`${field} mt-1`} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">{t("subject")}</span>
                <input value={letter.subject} onChange={(e) => set({ subject: e.target.value })} className={`${field} mt-1`} />
              </label>
            </div>
          </div>
          <label className="block text-sm">
            <span className="font-medium">{t("body")}</span>{" "}
            <span className={`text-xs tabular-nums ${words > 340 || words < 230 ? "text-[oklch(0.42_0.1_60)]" : "text-muted-foreground"}`}>
              {t("words", { count: words })}
            </span>
            <textarea value={letter.body} rows={16} onChange={(e) => set({ body: e.target.value })} className={`${field} mt-1 leading-relaxed`} />
          </label>

          {letter.checks.length > 0 && (
            <div className="rounded-md bg-warning/10 p-3 text-sm text-[oklch(0.42_0.1_60)]">
              <p className="flex items-center gap-1.5 font-medium">
                <CircleAlert className="size-4" strokeWidth={1.75} aria-hidden />
                {t("checks")}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {letter.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass("primary")} onClick={download} disabled={downloading}>
              {downloading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" strokeWidth={1.75} aria-hidden />}
              {t("download")}
            </button>
            <button type="button" className={buttonClass("outline")} onClick={copy}>
              <Copy className="size-4" strokeWidth={1.75} aria-hidden />
              {copied ? t("copied") : t("copy")}
            </button>
            <button type="button" className={buttonClass("ghost")} onClick={() => setStep("questions")}>
              <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
              {t("again")}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
