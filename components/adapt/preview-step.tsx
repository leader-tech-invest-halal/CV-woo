"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Download, LoaderCircle } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ParsedResume } from "@/lib/cv/types";
import { ApiError, exportResume } from "./api";
import { applyTemplate, TEMPLATES, type TemplateId } from "@/lib/export/templates";
import { TemplateThumbnail } from "./template-thumbnail";

type Files = { pdf: Blob | null; docx: Blob | null };

export function PreviewStep({
  file,
  resume,
  accepted,
  onBack,
  onRestart,
  onError,
}: {
  file: File;
  resume: ParsedResume;
  accepted: Record<string, string>;
  onBack: () => void;
  onRestart: () => void;
  onError: (code: string | null) => void;
}) {
  const t = useTranslations("adapt.preview");
  const [tab, setTab] = useState<"pdf" | "docx">(resume.format === "docx" ? "docx" : "pdf");
  const [template, setTemplate] = useState<TemplateId>("original");
  const [files, setFiles] = useState<Files>({ pdf: null, docx: null });
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const docxRef = useRef<HTMLDivElement>(null);

  // Génère les deux fichiers une seule fois : ce sont exactement ceux qui seront téléchargés
  useEffect(() => {
    let cancelled = false;
    onError(null);
    setFiles({ pdf: null, docx: null });
    Promise.all([
      exportResume("pdf", file, resume, accepted, template),
      exportResume("docx", file, resume, accepted, template),
    ])
      .then(([pdf, docx]) => {
        if (cancelled) return;
        setFiles({ pdf, docx });
        setPdfUrl(URL.createObjectURL(pdf));
      })
      .catch((e) => !cancelled && onError(e instanceof ApiError ? e.code : "server_error"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, resume, accepted, template]);

  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  // Aperçu Word fidèle, rendu dans la page
  useEffect(() => {
    if (tab !== "docx" || !files.docx || !docxRef.current) return;
    const container = docxRef.current;
    container.innerHTML = "";
    import("docx-preview").then(({ renderAsync }) =>
      renderAsync(files.docx!, container, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true }),
    );
  }, [tab, files.docx]);

  const download = (format: "pdf" | "docx") => {
    const blob = files[format];
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${resume.fileName.replace(/\.(pdf|docx)$/i, "") || "cv"}-cv-woo.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const ready = files.pdf && files.docx;
  const note =
    template !== "original"
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
            <button type="button" className={buttonClass("primary")} disabled={!ready} onClick={() => download("pdf")}>
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
              {t("downloadPdf")}
            </button>
            <button type="button" className={buttonClass("outline")} disabled={!ready} onClick={() => download("docx")}>
              <Download className="size-4" strokeWidth={1.75} aria-hidden />
              {t("downloadDocx")}
            </button>
          </div>
        </div>

        <p className="mt-5 text-sm font-medium">{t("templates.title")}</p>
        {/* Miniatures des modèles : « Votre design » utilise les couleurs et la disposition du CV importé */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" role="radiogroup" aria-label={t("templates.title")}>
          {TEMPLATES.map((id) => {
            const selected = template === id;
            const style = applyTemplate(resume.style, id);
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
                  <TemplateThumbnail style={style} />
                </div>
                <span className="mt-2 text-sm font-medium">{t(`templates.${id}`)}</span>
                <span className="text-xs leading-snug text-muted-foreground">{t(`templateDesc.${id}`)}</span>
                {style.layout === "single" && (
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
        <p className="mt-2 text-xs text-muted-foreground">{t("printHint")}</p>
      </Card>

      <div className="overflow-hidden rounded-lg border border-border bg-muted">
        {!ready ? (
          <div className="flex h-96 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
            {t("loading")}
          </div>
        ) : tab === "pdf" ? (
          <iframe src={pdfUrl ?? undefined} title={t("tabPdf")} className="h-[80dvh] w-full bg-white" />
        ) : (
          <div ref={docxRef} className="docx-preview max-h-[80dvh] overflow-auto" />
        )}
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
