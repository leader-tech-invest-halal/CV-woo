"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookmarkPlus, CircleCheck, LoaderCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import type { ParsedResume } from "@/lib/cv/types";
import type { LayoutMode } from "@/lib/export/layout";
import type { TemplateId } from "@/lib/export/templates";
import { saveToHistory, type HistoryMeta } from "./history-api";

/**
 * Bouton « Enregistrer dans mon historique » (facultatif). Rien n'est gardé sans ce clic.
 * Un enregistrement par combinaison modèle + mise en page affichée.
 */
export function SaveToHistory({
  meta,
  signedIn,
  resume,
  accepted,
  template,
  layout,
  disabled,
}: {
  meta: HistoryMeta;
  signedIn: boolean;
  resume: ParsedResume;
  accepted: Record<string, string>;
  template: TemplateId;
  layout: LayoutMode;
  disabled: boolean;
}) {
  const t = useTranslations("history.save");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${template}:${layout}:${JSON.stringify(accepted).length}`;

  if (!signedIn) {
    return (
      <p className="text-sm text-muted-foreground">
        {t.rich("guest", {
          link: (chunks) => (
            <Link href="/login?mode=signup" className="font-medium text-primary underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    );
  }

  if (saved.has(key)) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" role="status">
        <CircleCheck className="size-4 text-primary" strokeWidth={1.75} aria-hidden />
        <span>{t("done")}</span>
        <Link href="/history" className="font-medium text-primary underline underline-offset-2">
          {t("open")}
        </Link>
      </p>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    const r = await saveToHistory(meta, resume, accepted, template, layout);
    setBusy(false);
    if (r.ok) setSaved((s) => new Set(s).add(key));
    else setError(r.code);
  };

  return (
    <div>
      <button type="button" className={buttonClass("outline", "md", "w-full sm:w-auto")} disabled={disabled || busy} onClick={save}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <BookmarkPlus className="size-4" strokeWidth={1.75} aria-hidden />}
        {t("button")}
      </button>
      <p className="mt-1.5 text-xs text-muted-foreground">{t("hint")}</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}
