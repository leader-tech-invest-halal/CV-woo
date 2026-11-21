"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, CircleAlert, Download, FileText, RotateCcw } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ParsedResume } from "@/lib/cv/types";
import { ApiError, exportResume, type BalanceInfo } from "./api";
import { ATS_SAFE, TEMPLATES, type TemplateId } from "@/lib/export/templates";
import { LAYOUT_MODES, type LayoutMode } from "@/lib/export/layout";
import { LiveThumbnail } from "./live-thumbnail";
import { ProgressSteps } from "./analysis-step";
import { PdfPages, useTouchDevice } from "./pdf-pages";
import { InAppNotice } from "./in-app-notice";
import { detectInAppBrowser } from "@/lib/in-app-browser";
import { SaveToHistory } from "@/components/history/save-to-history";
import type { HistoryMeta } from "@/components/history/history-api";
import { AtsCompare } from "./ats-compare";
import { computeAtsScore, keywordCheck, keywordStuffing, type AtsReadiness } from "@/lib/ats/checks";

type Files = { pdf: Blob | null; docx: Blob | null };

export function PreviewStep({
  file,
  resume,
  accepted,
  onBack,
  onRestart,
  onError,
  history,
  keywords = [],
}: {
  file: File;
  resume: ParsedResume;
  accepted: Record<string, string>;
  onBack: () => void;
  onRestart: () => void;
  onError: (code: string | null) => void;
  /** Pour l'historique : titre de l'offre, entreprise, score, et si la personne est connectée. */
  history?: { meta: HistoryMeta; signedIn: boolean };
  /** Mots-clés de l'offre (analyse), comptés dans le score ATS avant et après */
  keywords?: { term: string; importance: "required" | "nice" }[];
}) {
  const t = useTranslations("adapt.preview");
  const ta = useTranslations("adapt.analyzing");
  const [tab, setTab] = useState<"pdf" | "docx">(resume.format === "docx" ? "docx" : "pdf");
  const [template, setTemplate] = useState<TemplateId>("original");
  const [layout, setLayout] = useState<LayoutMode>("compact");
  const [pages, setPages] = useState<number | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [ats, setAts] = useState<{ pdf: AtsReadiness | null; docx: AtsReadiness | null }>({ pdf: null, docx: null });
  // Avertissement du serveur (ex. Word à zones de texte recréé au lieu d'être modifié sur place)
  const [notice, setNotice] = useState<string | null>(null);
  const [files, setFiles] = useState<Files>({ pdf: null, docx: null });
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const docxRef = useRef<HTMLDivElement>(null);
  const touch = useTouchDevice();
  const [progress, setProgress] = useState({ pdf: false, docx: false });
  // Fichier qui n'a pas pu être préparé (l'autre reste téléchargeable), et nouvel essai
  const [failed, setFailed] = useState<{ pdf: boolean; docx: boolean }>({ pdf: false, docx: false });
  const [attempt, setAttempt] = useState(0);
  const inApp = useMemo(() => detectInAppBrowser(), []);
  const [shareHelp, setShareHelp] = useState(false);

  // Génère les deux fichiers une seule fois : ce sont exactement ceux qui seront téléchargés
  useEffect(() => {
    let cancelled = false;
    onError(null);
    setFiles({ pdf: null, docx: null });
    setPages(null);
    setBalance(null);
    setShowHidden(false);
    setAts({ pdf: null, docx: null });
    setProgress({ pdf: false, docx: false });
    setFailed({ pdf: false, docx: false });
    // Chaque fichier est préparé et rendu disponible dès qu'il est prêt, indépendamment de l'autre :
    // avant, un échec du Word empêchait aussi de télécharger le PDF.
    const fail = (format: "pdf" | "docx") => (e: unknown) => {
      if (cancelled) return;
      setFailed((f) => ({ ...f, [format]: true }));
      setProgress((p) => ({ ...p, [format]: true }));
      onError(e instanceof ApiError ? e.code : "server_error");
    };
    exportResume("pdf", file, resume, accepted, template, layout, keywords)
      .then((pdf) => {
        if (cancelled) return;
        setProgress((p) => ({ ...p, pdf: true }));
        setFiles((f) => ({ ...f, pdf: pdf.blob }));
        setPages(pdf.pages);
        setBalance(pdf.balance);
        setAts((a) => ({ ...a, pdf: pdf.ats }));
        setPdfUrl(URL.createObjectURL(pdf.blob));
      })
      .catch(fail("pdf"));
    exportResume("docx", file, resume, accepted, template, layout, keywords)
      .then((docx) => {
        if (cancelled) return;
        setProgress((p) => ({ ...p, docx: true }));
        setFiles((f) => ({ ...f, docx: docx.blob }));
        setAts((a) => ({ ...a, docx: docx.ats }));
        setNotice(docx.notice);
      })
      .catch(fail("docx"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, resume, accepted, template, layout, attempt]);

  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  // Aperçu Word fidèle, rendu dans la page
  useEffect(() => {
    if (tab !== "docx" || !files.docx || !docxRef.current) return;
    const container = docxRef.current;
    container.innerHTML = "";
    import("docx-preview").then(({ renderAsync }) =>
      renderAsync(files.docx!, container, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true }).then(() => {
        // Sur petit écran, la page A4 est réduite à la largeur disponible (pas de défilement horizontal)
        const page = container.querySelector<HTMLElement>(".docx-wrapper > section");
        const wrapper = container.querySelector<HTMLElement>(".docx-wrapper");
        if (!page || !wrapper) return;
        const scale = Math.min(1, (container.clientWidth - 16) / page.offsetWidth);
        if (scale < 1) {
          wrapper.style.setProperty("zoom", String(scale));
          wrapper.style.padding = "8px";
        }
      }),
    );
  }, [tab, files.docx]);

  const fileName = (format: "pdf" | "docx") => `${resume.fileName.replace(/\.(pdf|docx)$/i, "") || "cv"}-cv-woo.${format}`;
  const MIME = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

  const download = (format: "pdf" | "docx") => {
    const blob = files[format];
    if (!blob) return;
    // Lien ajouté à la page avant le clic (exigé par Firefox) et libéré bien plus tard
    // (Safari sur iPhone lit le fichier après le clic : le libérer trop tôt annulait le téléchargement)
    const url = URL.createObjectURL(new Blob([blob], { type: MIME[format] }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(format);
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    // Navigateur intégré d'une application : le téléchargement est souvent bloqué, on explique quoi faire
    if (inApp) setShareHelp(true);
  };

  // Sur téléphone : « Enregistrer / partager » par le menu du système (Fichiers, Drive, e-mail…),
  // solution de secours quand le téléchargement direct ne fait rien.
  const canShareFiles =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    (() => {
      try {
        return navigator.canShare({ files: [new File([""], "cv.pdf", { type: "application/pdf" })] });
      } catch {
        return false;
      }
    })();
  const share = async (format: "pdf" | "docx") => {
    const blob = files[format];
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], fileName(format), { type: MIME[format] })] });
    } catch {
      // partage annulé par la personne
    }
  };

  const ready = { pdf: !!files.pdf, docx: !!files.docx };
  const anyFailed = failed.pdf || failed.docx;
  // Score du CV d'origine : lisibilité mesurée à l'import + mots-clés de l'offre dans son texte
  const atsBefore = useMemo(() => {
    if (!resume.ats) return null;
    if (!keywords.length) return resume.ats;
    const text = resume.blocks.map((b) => b.text).join("\n");
    const offer = keywords.map((x) => ({ ...x, variants: [] }));
    const k = keywordCheck(text, offer);
    const stuffed = keywordStuffing(text, offer);
    // Mêmes contrôles qu'après adaptation, pour une comparaison juste
    const checks = [
      ...resume.ats.checks.filter((c) => c.id !== "keywords" && c.id !== "stuffing"),
      k.check,
      { id: "stuffing", category: "offer" as const, status: stuffed.length ? ("warn" as const) : ("pass" as const), weight: 4, params: { terms: stuffed.slice(0, 3).join(", "), count: stuffed.length } },
    ];
    return { score: computeAtsScore(checks), checks, keywords: { found: k.found, missing: k.missing } };
  }, [resume, keywords]);
  const note =
    template === "moderne"
      ? t("templateHintTwoColumns")
      : template !== "original"
      ? t("templateHint")
      : resume.format === "pdf"
        ? t("fromPdf")
        : tab === "docx"
          ? t("docxSame")
          : t("pdfFromDocx");

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={buttonClass("primary")} disabled={!ready.pdf} onClick={() => download("pdf")}>
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
              {t("downloadPdf")}
            </button>
            <button type="button" className={buttonClass("outline")} disabled={!ready.docx} onClick={() => download("docx")}>
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
              {t("downloadDocx")}
            </button>
          </div>
        </div>
        {anyFailed && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p>{t(failed.pdf && failed.docx ? "exportFailedBoth" : failed.pdf ? "exportFailedPdf" : "exportFailedDocx")}</p>
            <button type="button" className={buttonClass("outline", "md", "shrink-0")} onClick={() => setAttempt((n) => n + 1)}>
              <RotateCcw className="size-4" strokeWidth={1.75} aria-hidden />
              {t("exportRetry")}
            </button>
          </div>
        )}
        {(shareHelp || inApp) && (
          <div className="mt-4">
            <InAppNotice />
          </div>
        )}
        {canShareFiles && (ready.pdf || ready.docx) && (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("shareHint")}{" "}
            {ready.pdf && (
              <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => share("pdf")}>
                {t("sharePdf")}
              </button>
            )}
            {ready.pdf && ready.docx && " · "}
            {ready.docx && (
              <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => share("docx")}>
                {t("shareDocx")}
              </button>
            )}
          </p>
        )}

        {history && (
          <div className="mt-4">
            <SaveToHistory
              meta={history.meta}
              signedIn={history.signedIn}
              resume={resume}
              accepted={accepted}
              template={template}
              layout={layout}
              disabled={!ready}
            />
          </div>
        )}

        <p className="mt-5 text-sm font-medium">{t("templates.title")}</p>
        {/* Miniatures des modèles : « Votre design » utilise les couleurs et la disposition du CV importé */}
        {/* Chaque miniature est la vraie première page du PDF de ce modèle, avec ce CV */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t("templates.title")}>
          {TEMPLATES.map((id) => {
            const selected = template === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTemplate(id)}
                className={`group relative flex flex-col rounded-lg border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  selected ? "border-primary bg-accent/50 ring-2 ring-primary/30" : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                {selected && (
                  <span className="absolute top-3 right-3 z-10 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-card">
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
                  </span>
                )}
                <div className="mx-auto w-full max-w-[150px]">
                  <LiveThumbnail template={id} file={file} resume={resume} accepted={accepted} layout={layout} />
                </div>
                <span className="mt-2 text-sm font-medium">{t(`templates.${id}`)}</span>
                <span className="text-xs leading-snug text-muted-foreground">{t(`templateDesc.${id}`)}</span>
                {(ATS_SAFE.has(id) || (id === "original" && resume.style.layout === "single")) && (
                  <span className="mt-1.5 inline-flex w-fit rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                    {t("atsSafe")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {template === "original" && resume.style.bodyFont && (
          <p className="mt-2 text-xs text-muted-foreground">{t("font", { font: resume.style.bodyFont })}</p>
        )}

        {/* Mise en page : une page si possible, ou version aérée sur deux pages */}
        <p className="mt-5 text-sm font-medium">{t("layout.title")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t("layout.title")}>
          {LAYOUT_MODES.map((id) => {
            const selected = layout === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setLayout(id)}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                  selected ? "border-primary bg-accent/50 ring-2 ring-primary/30" : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                <span
                  className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${
                    selected ? "border-primary bg-primary" : "border-muted-foreground/50"
                  }`}
                  aria-hidden
                >
                  {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                </span>
                <span>
                  <span className="block text-sm font-medium">{t(`layout.${id}`)}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{t(`layout.${id}Desc`)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm" aria-live="polite">
          <FileText className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
          <span>
            {pages === null
              ? t("layout.counting")
              : t("layout.pages", { count: pages })}
            {pages !== null && pages > 1 && layout === "compact" && (
              <span className="block text-xs text-muted-foreground">{t("layout.tooLong")}</span>
            )}
          </span>
        </p>

        {/* Équilibre de la page, mesuré dans le PDF affiché, et ajustements faits automatiquement */}
        {balance && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {balance.after.side !== null && (
              <p>
                <span className="font-medium">{t("balance.title")}</span>{" "}
                {t("balance.columns", { side: balance.after.side, main: balance.after.main })}
              </p>
            )}
            {balance.moved.map((m) => (
              <p key={m.heading} className="text-muted-foreground">
                {t(m.to === "sidebar" ? "balance.movedSide" : "balance.movedMain", { heading: m.heading })}
              </p>
            ))}
            {balance.hidden.length > 0 && (
              <div className="text-muted-foreground">
                <p>
                  {t("balance.hidden", { count: balance.hidden.length })}{" "}
                  <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => setShowHidden((v) => !v)}>
                    {showHidden ? t("balance.hideList") : t("balance.showList")}
                  </button>
                </p>
                {showHidden && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {balance.hidden.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {/* Ce que le code n'a pas pu régler seul : on le dit clairement, avec quoi faire */}
            {balance.after.side !== null && balance.after.pages === 1 && Math.abs(balance.after.main - balance.after.side) > 15 && (
              <p className="flex gap-2 text-[oklch(0.42_0.1_60)]">
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {t(balance.after.side < balance.after.main ? "balance.sideShort" : "balance.sideLong")}
              </p>
            )}
            {balance.after.pages > 1 && layout === "compact" && (
              <p className="flex gap-2 text-[oklch(0.42_0.1_60)]">
                <CircleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {t("balance.stillLong")}
              </p>
            )}
          </div>
        )}

        {/* Contrôle ATS du fichier affiché, comparé au CV d'origine */}
        <div className="mt-5 border-t border-border pt-5">
          <AtsCompare before={atsBefore} after={ready[tab] ? ats[tab] : null} />
        </div>

        <div role="tablist" className="mt-5 inline-flex gap-1 rounded-lg bg-muted p-1">
          {(["pdf", "docx"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={tab === v}
              onClick={() => setTab(v)}
              className={`min-h-9 rounded-md px-4 text-sm font-medium ${
                tab === v ? "bg-background shadow-card" : "text-muted-foreground"
              }`}
            >
              {v === "pdf" ? t("tabPdf") : t("tabDocx")}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{note}</p>
        {notice && (
          <p role="status" className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            {t(`notice.${notice}`)}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("printHint")}</p>
      </Card>

      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        {!ready ? (
          <div className="flex h-96 items-center justify-center bg-background px-6">
            <ProgressSteps
              steps={[
                { label: ta("layout"), state: progress.pdf ? "done" : "active" },
                { label: ta("preview"), state: progress.docx ? "done" : progress.pdf ? "active" : "pending" },
              ]}
            />
          </div>
        ) : tab === "pdf" ? (
          touch && files.pdf ? (
            <PdfPages blob={files.pdf} label={t("tabPdf")} />
          ) : (
            <iframe src={pdfUrl ?? undefined} title={t("tabPdf")} className="h-[80dvh] w-full bg-white" />
          )
        ) : (
          <div ref={docxRef} className="docx-preview overflow-x-hidden md:max-h-[80dvh] md:overflow-auto" />
        )}
      </div>

      {/* Sur téléphone : téléchargement aussi sous l'aperçu, sans remonter en haut de la page */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        <button type="button" className={buttonClass("primary")} disabled={!ready.pdf} onClick={() => download("pdf")}>
          <Download className="size-4" strokeWidth={1.75} aria-hidden />
          PDF
        </button>
        <button type="button" className={buttonClass("outline")} disabled={!ready.docx} onClick={() => download("docx")}>
          <Download className="size-4" strokeWidth={1.75} aria-hidden />
          Word
        </button>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className={buttonClass("ghost")} onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className={buttonClass("outline")} onClick={onRestart}>
          {t("restart")}
        </button>
      </div>
    </div>
  );
}
