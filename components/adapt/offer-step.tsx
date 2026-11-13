"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link2, LoaderCircle, TextQuote } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiError, fetchOffer } from "./api";

export function OfferStep({
  text,
  onText,
  onBack,
  onAnalyze,
  onError,
}: {
  text: string;
  onText: (t: string) => void;
  onBack: () => void;
  onAnalyze: () => void;
  onError: (code: string | null) => void;
}) {
  const t = useTranslations("adapt.offer");
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);
  const ready = text.trim().length >= 200;

  const fetchUrl = async () => {
    setFetching(true);
    onError(null);
    try {
      const res = await fetchOffer(url);
      onText(res.text);
      setFetched(true);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server_error";
      onError(code);
      if (code === "offer_blocked" || code === "offer_unreachable") setMode("text");
    } finally {
      setFetching(false);
    }
  };

  const tab = (value: "url" | "text", label: string, Icon: typeof Link2) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => setMode(value)}
      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
        mode === value ? "bg-background text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" strokeWidth={1.5} aria-hidden />
      {label}
    </button>
  );

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      <div role="tablist" className="mt-6 flex gap-1 rounded-lg bg-muted p-1">
        {tab("url", t("tabUrl"), Link2)}
        {tab("text", t("tabText"), TextQuote)}
      </div>

      {mode === "url" && (
        <div className="mt-5">
          <label htmlFor="offer-url" className="text-sm font-medium">
            {t("urlLabel")}
          </label>
          <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
            <input
              id="offer-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url && fetchUrl()}
              placeholder={t("urlPlaceholder")}
              className="min-h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button type="button" className={buttonClass("outline")} disabled={!url || fetching} onClick={fetchUrl}>
              {fetching && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {fetching ? t("fetching") : t("fetch")}
            </button>
          </div>
          {fetched && <p className="mt-2 text-sm text-accent-foreground">{t("fetched")}</p>}
        </div>
      )}

      {(mode === "text" || fetched) && (
        <div className="mt-5">
          <label htmlFor="offer-text" className="text-sm font-medium">
            {t("textLabel")}
          </label>
          <textarea
            id="offer-text"
            value={text}
            onChange={(e) => onText(e.target.value)}
            placeholder={t("textPlaceholder")}
            rows={12}
            maxLength={20000}
            className="mt-1.5 w-full rounded-md border border-input bg-background p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className={`mt-1 text-xs ${ready ? "text-muted-foreground" : "text-[oklch(0.47_0.12_60)]"}`}>
            {t("chars", { count: text.trim().length })}
            {!ready && ` · ${t("minChars")}`}
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" className={buttonClass("ghost")} onClick={onBack}>
          {t("back")}
        </button>
        <button type="button" className={buttonClass("primary")} disabled={!ready} onClick={onAnalyze}>
          {t("analyze")}
        </button>
      </div>
    </Card>
  );
}
