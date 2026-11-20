"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, ExternalLink, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { chromeIntentUrl, detectInAppBrowser, type InAppBrowser } from "@/lib/in-app-browser";

/**
 * Avertissement affiché seulement dans le navigateur intégré d'une application (LinkedIn,
 * Instagram, Facebook…) : le téléchargement du CV y est souvent bloqué. On propose d'ouvrir la
 * page dans Chrome ou Safari AVANT de commencer (le CV importé ne suit pas d'un navigateur à l'autre).
 */
export function InAppNotice() {
  const t = useTranslations("adapt.inApp");
  const [browser, setBrowser] = useState<InAppBrowser | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setBrowser(detectInAppBrowser()), []);
  if (!browser) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt(t("copyPrompt"), window.location.href);
    }
  };

  return (
    <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{browser.app ? t("title", { app: browser.app }) : t("titleGeneric")}</p>
          <p>{browser.ios ? t("howIos") : t("howAndroid")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        {browser.android && (
          <a href={chromeIntentUrl(window.location.href)} className={buttonClass("primary", "md")}>
            <ExternalLink className="size-4" strokeWidth={1.75} aria-hidden />
            {t("openChrome")}
          </a>
        )}
        <button type="button" onClick={copy} className={buttonClass("outline", "md")}>
          <Copy className="size-4" strokeWidth={1.75} aria-hidden />
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}
