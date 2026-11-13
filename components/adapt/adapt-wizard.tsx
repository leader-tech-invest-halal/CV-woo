"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import type { AnalysisResult, ParsedResume } from "@/lib/cv/types";
import { ApiError, analyzeResume, parseResume } from "./api";
import { MAX_FILE_BYTES, ResumeStep } from "./resume-step";
import { OfferStep } from "./offer-step";
import { AnalysisStep, Analyzing } from "./analysis-step";
import { PreviewStep } from "./preview-step";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { buttonClass } from "@/components/ui/button";

type Step = "resume" | "offer" | "analysis" | "preview";
const STEPS: Step[] = ["resume", "offer", "analysis", "preview"];

// Parcours : importer le CV → ajouter l'offre → analyser → prévisualiser et télécharger.
// Tout reste dans le navigateur ; le serveur ne garde rien.
export function AdaptWizard() {
  const t = useTranslations("adapt");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("resume");
  const [file, setFile] = useState<File | null>(null);
  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [offerText, setOfferText] = useState("");
  const [result, setResult] = useState<(AnalysisResult & { remaining?: number | null; signedIn?: boolean }) | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const ta = useTranslations("auth");
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  // Textes modifiés à la main par la personne (prioritaires sur la proposition de l'IA)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiError ? e.code : "server_error");

  const onFile = async (f: File) => {
    setError(null);
    if (f.size > MAX_FILE_BYTES) return setError("file_too_large");
    if (!/\.(pdf|docx)$/i.test(f.name)) return setError("unsupported_file");
    setBusy(true);
    setResume(null);
    setResult(null);
    try {
      const parsed = await parseResume(f);
      setFile(f);
      setResume(parsed);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const onAnalyze = async () => {
    if (!resume) return;
    setError(null);
    setBusy(true);
    setStep("analysis");
    try {
      const r = await analyzeResume(locale, resume, offerText);
      setResult(r);
      // Les modifications signalées par la vérification ne sont pas cochées par défaut
      setEdits({});
      setAccepted(Object.fromEntries(r.rewrites.map((w) => [w.blockId, w.flags.length === 0])));
    } catch (e) {
      setStep("offer");
      // Adaptation offerte déjà utilisée : on demande de créer un compte, sans perdre le CV ni l'offre
      if (e instanceof ApiError && e.code === "auth_required") setAuthOpen(true);
      else fail(e);
    } finally {
      setBusy(false);
    }
  };

  const acceptedTexts = useMemo(
    () => Object.fromEntries((result?.rewrites ?? []).filter((r) => accepted[r.blockId]).map((r) => [r.blockId, edits[r.blockId] ?? r.after])),
    [result, accepted, edits],
  );

  const restart = () => {
    setOfferText("");
    setResult(null);
    setAccepted({});
    setStep("offer");
  };

  const current = STEPS.indexOf(step);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <ol className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex shrink-0 items-center gap-2">
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums ${
                  i <= current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className={i === current ? "font-medium" : "text-muted-foreground"}>{t(`steps.${s}`)}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border sm:w-8" aria-hidden />}
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
          <p>{t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.server_error")}</p>
        </div>
      )}

      <AuthDialog
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          onAnalyze();
        }}
      />

      {result && step !== "resume" && step !== "offer" && result.signedIn === false && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{ta("trialNotice")}</p>
          <button type="button" className={buttonClass("outline", "md", "shrink-0")} onClick={() => setAuthOpen(true)}>
            {ta("trialCta")}
          </button>
        </div>
      )}
      {result && step === "analysis" && typeof result.remaining === "number" && (
        <p className="text-sm text-muted-foreground">{ta("remaining", { count: result.remaining })}</p>
      )}

      {step === "resume" && (
        <ResumeStep resume={resume} file={file} loading={busy} onFile={onFile} onNext={() => setStep("offer")} />
      )}

      {step === "offer" && (
        <OfferStep
          text={offerText}
          onText={setOfferText}
          onBack={() => setStep("resume")}
          onAnalyze={onAnalyze}
          onError={setError}
        />
      )}

      {step === "analysis" && busy && <Analyzing />}

      {step === "analysis" && !busy && result && (
        <AnalysisStep
          result={result}
          accepted={accepted}
          onToggle={(id) => setAccepted((a) => ({ ...a, [id]: !a[id] }))}
          edits={edits}
          onEdit={(id, text) => {
            setEdits((e) => ({ ...e, [id]: text }));
            // Modifier une phrase vaut acceptation : la personne a choisi son texte
            setAccepted((a) => ({ ...a, [id]: true }));
          }}
          onBack={() => setStep("offer")}
          onNext={() => setStep("preview")}
        />
      )}

      {step === "preview" && file && resume && (
        <PreviewStep
          file={file}
          resume={resume}
          accepted={acceptedTexts}
          onBack={() => setStep("analysis")}
          onRestart={restart}
          onError={setError}
        />
      )}
    </div>
  );
}
