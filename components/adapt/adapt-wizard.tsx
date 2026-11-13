"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import type { AnalysisResult, ParsedResume } from "@/lib/cv/types";
import { ApiError, analyzeResume, parseResume } from "./api";
import { MAX_FILE_BYTES, ResumeStep } from "./resume-step";
import { OfferStep } from "./offer-step";
import { Analyzing, ChangesStep, CompareStep, RequirementsStep, ReviewStep } from "./analysis-step";
import { PreviewStep } from "./preview-step";
import { FLOW, FlowStepper, type FlowStep } from "./flow-stepper";
import { AuthDialog } from "@/components/auth/auth-dialog";
import { buttonClass } from "@/components/ui/button";

type Result = AnalysisResult & { remaining?: number | null; signedIn?: boolean };

// Parcours guidé en 7 étapes :
// CV → offre → exigences → comparaison → propositions → validation → aperçu et téléchargement.
// Tout reste dans le navigateur ; le serveur ne garde rien.
export function AdaptWizard() {
  const t = useTranslations("adapt");
  const tf = useTranslations("adapt.flow");
  const ta = useTranslations("auth");
  const locale = useLocale();

  const [step, setStep] = useState<FlowStep>("resume");
  const [reached, setReached] = useState(0); // étape la plus avancée atteinte
  const [file, setFile] = useState<File | null>(null);
  const [resume, setResume] = useState<ParsedResume | null>(null);
  const [offerText, setOfferText] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  // Textes modifiés à la main par la personne (prioritaires sur la proposition de l'IA)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; retry?: () => void } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const go = (next: FlowStep) => {
    setStep(next);
    setReached((r) => Math.max(r, FLOW.indexOf(next)));
    setError(null);
  };

  // À chaque changement d'écran, on remonte en haut du parcours
  useEffect(() => {
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  // Le message de réussite disparaît après quelques secondes
  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(null), 6000);
    return () => clearTimeout(id);
  }, [success]);

  const codeOf = (e: unknown) => (e instanceof ApiError ? e.code : "server_error");

  const onFile = async (f: File) => {
    setError(null);
    setSuccess(null);
    if (f.size > MAX_FILE_BYTES) return setError({ code: "file_too_large" });
    if (!/\.(pdf|docx)$/i.test(f.name)) return setError({ code: "unsupported_file" });
    setBusy(true);
    setResume(null);
    setResult(null);
    setReached(0);
    try {
      const parsed = await parseResume(f);
      setFile(f);
      setResume(parsed);
      setSuccess(tf("success.parsed", { count: parsed.structure.sections.length }));
    } catch (e) {
      setError({ code: codeOf(e), retry: () => onFile(f) });
    } finally {
      setBusy(false);
    }
  };

  const onAnalyze = async () => {
    if (!resume) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    go("requirements");
    try {
      const r = await analyzeResume(locale, resume, offerText);
      setResult(r);
      // Les modifications signalées par la vérification ne sont pas cochées par défaut
      setEdits({});
      setAccepted(Object.fromEntries(r.rewrites.map((w) => [w.blockId, w.flags.length === 0])));
      setReached(FLOW.indexOf("requirements"));
      setSuccess(tf("success.analyzed"));
    } catch (e) {
      setStep("offer");
      setReached(FLOW.indexOf("offer"));
      // Adaptation offerte déjà utilisée : on demande de créer un compte, sans perdre le CV ni l'offre
      if (e instanceof ApiError && e.code === "auth_required") setAuthOpen(true);
      else setError({ code: codeOf(e), retry: onAnalyze });
    } finally {
      setBusy(false);
    }
  };

  const acceptedTexts = useMemo(
    () =>
      Object.fromEntries(
        (result?.rewrites ?? []).filter((r) => accepted[r.blockId]).map((r) => [r.blockId, edits[r.blockId] ?? r.after]),
      ),
    [result, accepted, edits],
  );

  const restart = () => {
    setOfferText("");
    setResult(null);
    setAccepted({});
    setEdits({});
    setStep("offer");
    setReached(FLOW.indexOf("offer"));
  };

  const analyzing = step === "requirements" && busy;

  return (
    <div className="space-y-6" ref={top}>
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <FlowStepper current={step} reached={busy ? FLOW.indexOf(step) : reached} onGo={(s) => !busy && go(s)} />
      </div>

      {/* Messages : réussite (discrète) et erreur (avec « Réessayer » quand c'est utile) */}
      <div aria-live="polite">
        {success && !error && (
          <p className="flex items-center gap-2 rounded-lg border border-primary/25 bg-accent px-4 py-3 text-sm text-accent-foreground">
            <CircleCheck className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {success}
          </p>
        )}
      </div>
      {error && (
        <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center">
          <div className="flex flex-1 gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
            <p>{t.has(`errors.${error.code}`) ? t(`errors.${error.code}`) : t("errors.server_error")}</p>
          </div>
          {error.retry && (
            <button type="button" className={buttonClass("outline", "md", "shrink-0")} onClick={error.retry}>
              <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
              {tf("retry")}
            </button>
          )}
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

      {result && !analyzing && FLOW.indexOf(step) >= FLOW.indexOf("requirements") && result.signedIn === false && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-accent p-4 text-sm text-accent-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{ta("trialNotice")}</p>
          <button type="button" className={buttonClass("outline", "md", "shrink-0")} onClick={() => setAuthOpen(true)}>
            {ta("trialCta")}
          </button>
        </div>
      )}
      {result && step === "requirements" && !busy && typeof result.remaining === "number" && (
        <p className="text-sm text-muted-foreground">{ta("remaining", { count: result.remaining })}</p>
      )}

      {step === "resume" && (
        <ResumeStep resume={resume} file={file} loading={busy} onFile={onFile} onNext={() => go("offer")} />
      )}

      {step === "offer" && (
        <OfferStep
          text={offerText}
          onText={setOfferText}
          onBack={() => go("resume")}
          onAnalyze={onAnalyze}
          onError={(code) => setError(code ? { code } : null)}
        />
      )}

      {analyzing && <Analyzing />}

      {step === "requirements" && !busy && result && (
        <RequirementsStep result={result} onBack={() => go("offer")} onNext={() => go("compare")} />
      )}

      {step === "compare" && result && (
        <CompareStep result={result} onBack={() => go("requirements")} onNext={() => go("changes")} />
      )}

      {step === "changes" && result && resume && (
        <ChangesStep
          result={result}
          resume={resume}
          accepted={accepted}
          onToggle={(id) => setAccepted((a) => ({ ...a, [id]: !a[id] }))}
          onSetAll={(accept) =>
            setAccepted(
              Object.fromEntries(
                // « Tout accepter » ne coche jamais une proposition signalée, sauf si la personne l'a réécrite
                result.rewrites.map((r) => [r.blockId, accept && (r.flags.length === 0 || edits[r.blockId] !== undefined)]),
              ),
            )
          }
          edits={edits}
          onEdit={(id, text) => {
            setEdits((e) => ({ ...e, [id]: text }));
            // Modifier une phrase vaut acceptation : la personne a choisi son texte
            setAccepted((a) => ({ ...a, [id]: true }));
          }}
          onBack={() => go("compare")}
          onNext={() => go("review")}
        />
      )}

      {step === "review" && result && resume && (
        <ReviewStep result={result} resume={resume} accepted={accepted} edits={edits} onBack={() => go("changes")} onNext={() => go("preview")} />
      )}

      {step === "preview" && file && resume && (
        <PreviewStep
          file={file}
          resume={resume}
          accepted={acceptedTexts}
          onBack={() => go("review")}
          onRestart={restart}
          onError={(code) => setError(code ? { code } : null)}
        />
      )}
    </div>
  );
}
