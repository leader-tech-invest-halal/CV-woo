"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, LoaderCircle, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ParsedResume } from "@/lib/cv/types";

const MAX = 5 * 1024 * 1024;

export function ResumeStep({
  resume,
  file,
  loading,
  onFile,
  onNext,
}: {
  resume: ParsedResume | null;
  file: File | null;
  loading: boolean;
  onFile: (file: File) => void;
  onNext: () => void;
}) {
  const t = useTranslations("adapt.resume");
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const pick = (f: File | undefined) => {
    if (f) onFile(f);
  };

  if (loading) {
    return (
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <LoaderCircle className="size-8 animate-spin text-primary" strokeWidth={1.5} aria-hidden />
        <p className="mt-4 font-medium">{t("reading")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("readingHint")}</p>
      </Card>
    );
  }

  if (resume && file) {
    const s = resume.structure;
    const name = s.nameBlockId ? resume.blocks.find((b) => b.id === s.nameBlockId)?.text : null;
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
            <FileText className="size-5" strokeWidth={1.5} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{file.name}</p>
            <p className="text-sm text-muted-foreground">{resume.format === "docx" ? t("docxNote") : t("pdfNote")}</p>
          </div>
        </div>

        <h3 className="mt-6 text-sm font-semibold">{t("detected")}</h3>
        <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
          {name && (
            <div>
              <dt className="text-muted-foreground">{t("name")}</dt>
              <dd className="font-medium">{name}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">{t("style")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              {[resume.style.accentColor, resume.style.headingColor, resume.style.sidebarColor]
                .filter((c, i, a): c is string => !!c && a.indexOf(c) === i)
                .map((c) => (
                  <span key={c} className="size-5 rounded-full border border-border" style={{ background: c }} title={c} />
                ))}
              <span>
                {t(`font.${resume.style.font}`)} · {t(`layout.${resume.style.layout}`)}
              </span>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">{t("sections")}</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {s.sections.map((sec, i) => {
                const count = sec.entries.reduce((n, e) => n + e.headerBlockIds.length + e.bulletBlockIds.length, 0);
                return (
                  <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {sec.heading} <span className="text-muted-foreground">· {t("lines", { count })}</span>
                  </span>
                );
              })}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" className={buttonClass("ghost")} onClick={() => input.current?.click()}>
            {t("change")}
          </button>
          <button type="button" className={buttonClass("primary")} onClick={onNext}>
            {t("next")}
          </button>
        </div>
        <input ref={input} type="file" hidden accept=".pdf,.docx" onChange={(e) => pick(e.target.files?.[0])} />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`mt-6 flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors ${
          over ? "border-primary bg-accent" : "border-border"
        }`}
      >
        <Upload className="size-8 text-primary" strokeWidth={1.5} aria-hidden />
        <p className="mt-3 font-medium">{t("drop")}</p>
        <p className="my-2 text-sm text-muted-foreground">{t("or")}</p>
        <button type="button" className={buttonClass("primary")} onClick={() => input.current?.click()}>
          {t("browse")}
        </button>
        <p className="mt-3 text-xs text-muted-foreground">{t("formats")}</p>
        <input
          ref={input}
          type="file"
          hidden
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </div>
    </Card>
  );
}

export { MAX as MAX_FILE_BYTES };
