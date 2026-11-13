"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, CircleX, FileText, LoaderCircle, ScanText, Upload } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScoreGauge } from "@/components/analysis/score-gauge";
import { SkillChip } from "@/components/analysis/skill-chip";
import type { AtsReport, Check, CheckCategory } from "@/lib/ats/checks";

const MAX = 5 * 1024 * 1024;
const CATEGORIES: CheckCategory[] = ["offer", "readability", "content", "file"];

export function AtsChecker() {
  const t = useTranslations("ats");
  const te = useTranslations("adapt.errors");
  const tr = useTranslations("adapt.resume");
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AtsReport | null>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX) return setError("file_too_large");
    if (!/\.(pdf|docx)$/i.test(f.name)) return setError("unsupported_file");
    setFile(f);
  };

  const check = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    if (offer.trim()) form.append("offer", offer);
    try {
      const res = await fetch("/api/ats/check", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "server_error");
      else {
        setReport(body);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setReport(null);
    setFile(null);
    setOffer("");
  };

  const message = (c: Check) => {
    const p = { ...(c.params ?? {}) };
    if (c.id === "layout" && typeof p.issues === "string") {
      p.issues = p.issues.split(",").filter(Boolean).map((i) => t(`issues.${i}`)).join(", ");
    }
    if (c.id === "sections" && typeof p.missing === "string") {
      p.missing = p.missing.split(",").filter(Boolean).map((s) => t(`sectionNames.${s}`)).join(", ");
    }
    const key = c.id === "length" || c.id === "dates" ? String(p.issue) : c.status;
    return t(`checks.${c.id}.${key}`, p);
  };

  const errorBox = error && (
    <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.75} aria-hidden />
      <p>{te.has(error) ? te(error) : te("server_error")}</p>
    </div>
  );

  if (report) {
    const count = (s: Check["status"]) => report.checks.filter((c) => c.status === s).length;
    const verdict = report.score >= 80 ? "good" : report.score >= 60 ? "ok" : "bad";
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:text-left">
          <ScoreGauge value={report.score} label={t("result.score")} size={128} />
          <div>
            <h2 className="text-xl font-semibold">{t(`result.verdict.${verdict}`)}</h2>
            <p className="mt-1 text-muted-foreground">
              {t("result.summary", { pass: count("pass"), warn: count("warn"), fail: count("fail") })}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">{t("result.disclaimer")}</p>
          </div>
        </Card>

        {report.keywords && (
          <Card className="p-6">
            <h3 className="font-semibold">{t("result.categories.offer")}</h3>
            {report.keywords.found.length > 0 && (
              <>
                <p className="mt-4 mb-2 text-xs font-medium text-muted-foreground">{t("result.keywordsFound")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.keywords.found.map((k) => (
                    <SkillChip key={k} state="present">{k}</SkillChip>
                  ))}
                </div>
              </>
            )}
            {report.keywords.missing.length > 0 && (
              <>
                <p className="mt-4 mb-2 text-xs font-medium text-muted-foreground">{t("result.keywordsMissing")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {report.keywords.missing.map((k) => (
                    <SkillChip key={k} state="missing">{k}</SkillChip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("result.keywordsHint")}</p>
              </>
            )}
          </Card>
        )}

        {CATEGORIES.map((cat) => {
          const items = report.checks.filter((c) => c.category === cat);
          if (!items.length) return null;
          return (
            <Card key={cat} className="p-6">
              <h3 className="font-semibold">{t(`result.categories.${cat}`)}</h3>
              <ul className="mt-4 space-y-4">
                {items.map((c) => {
                  const Icon = c.status === "pass" ? CircleCheck : c.status === "warn" ? CircleAlert : CircleX;
                  const color =
                    c.status === "pass" ? "text-primary" : c.status === "warn" ? "text-warning" : "text-destructive";
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} strokeWidth={1.75} aria-hidden />
                      <div>
                        <p className="font-medium">{t(`checks.${c.id}.title`)}</p>
                        <p className="text-sm text-muted-foreground">{message(c)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}

        <Card className="p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <ScanText className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
            {t("result.robotTitle")}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("result.robotHint")}</p>
          <pre className="mt-4 max-h-80 overflow-auto rounded-md border border-border bg-surface p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {report.plainText || t("result.robotEmpty")}
          </pre>
        </Card>

        <Card className="border-primary/30 bg-accent p-6">
          <h3 className="text-lg font-semibold text-accent-foreground">{t("result.ctaTitle")}</h3>
          <p className="mt-1 text-sm text-accent-foreground/90">{t("result.ctaText")}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/adapt" className={buttonClass("primary")}>
              {t("result.ctaButton")}
              <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
            </Link>
            <button type="button" className={buttonClass("ghost")} onClick={reset}>
              {t("result.again")}
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Card className="p-6">
      {errorBox && <div className="mb-5">{errorBox}</div>}
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
        className={`flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          over ? "border-primary bg-accent" : "border-border"
        }`}
      >
        {file ? (
          <>
            <FileText className="size-8 text-primary" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 max-w-full truncate font-medium">{file.name}</p>
            <button type="button" className="mt-1 text-sm text-muted-foreground underline" onClick={() => input.current?.click()}>
              {t("result.again")}
            </button>
          </>
        ) : (
          <>
            <Upload className="size-8 text-primary" strokeWidth={1.5} aria-hidden />
            <p className="mt-3 font-medium">{tr("drop")}</p>
            <button type="button" className={buttonClass("outline", "md", "mt-3")} onClick={() => input.current?.click()}>
              {tr("browse")}
            </button>
            <p className="mt-3 text-xs text-muted-foreground">{tr("formats")}</p>
          </>
        )}
        <input ref={input} type="file" hidden accept=".pdf,.docx" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <button
        type="button"
        onClick={() => setOfferOpen((o) => !o)}
        aria-expanded={offerOpen}
        className="mt-5 flex min-h-11 w-full items-center justify-between rounded-md text-left text-sm font-medium"
      >
        {t("form.offerToggle")}
        <ChevronDown className={`size-4 transition-transform ${offerOpen ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {offerOpen && (
        <div>
          <label htmlFor="ats-offer" className="text-sm text-muted-foreground">
            {t("form.offerLabel")}
          </label>
          <textarea
            id="ats-offer"
            rows={7}
            maxLength={20000}
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
            placeholder={t("form.offerPlaceholder")}
            className="mt-1.5 w-full rounded-md border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      <button type="button" disabled={!file || busy} onClick={check} className={buttonClass("primary", "lg", "mt-5 w-full")}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {busy ? t("form.checking") : t("form.check")}
      </button>
      <p className="mt-3 text-center text-xs text-muted-foreground">{t("hero.privacy")}</p>
    </Card>
  );
}
