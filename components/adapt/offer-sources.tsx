"use client";

import { useTranslations } from "next-intl";
import { CircleCheck, CircleDot, ClipboardPaste, Info } from "lucide-react";
import { PLATFORMS, type Platform, type PlatformStatus } from "@/lib/offer/platforms";
import type { OfferFields } from "@/lib/offer/extract";

/** Consigne quand un site ne permet pas la récupération automatique. */
export function ManualNotice({ platform, onPaste }: { platform: Platform; onPaste: () => void }) {
  const t = useTranslations("adapt.offer.sources");
  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/50 p-4 text-sm">
      <p className="flex items-start gap-2 font-medium">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
        {t(`reason.${platform.reason ?? "blocked"}`, { name: platform.name })}
      </p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-10 text-muted-foreground">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <button
        type="button"
        onClick={onPaste}
        className="mt-3 ml-6 inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-muted"
      >
        <ClipboardPaste className="size-4" strokeWidth={1.75} aria-hidden />
        {t("paste")}
      </button>
    </div>
  );
}

/** Ce que la récupération a trouvé : chaque champ, ou « non trouvé » (jamais deviné). */
export function FetchedSummary({ fields, platform }: { fields: OfferFields; platform: string | null }) {
  const t = useTranslations("adapt.offer.sources");
  const rows: [keyof OfferFields, string][] = [
    ["title", t("field.title")],
    ["company", t("field.company")],
    ["location", t("field.location")],
    ["contract", t("field.contract")],
  ];
  return (
    <div className="mt-3 rounded-lg border border-primary/25 bg-accent/40 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-accent-foreground">
        <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
        {platform ? t("fetchedFrom", { name: platform }) : t("fetchedGeneric")}
      </p>
      <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {rows.map(([key, label]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={`break-words ${fields[key] ? "font-medium" : "text-muted-foreground italic"}`}>{fields[key] ?? t("notFound")}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{t("honest")}</p>
    </div>
  );
}

const ICONS: Record<PlatformStatus, typeof CircleCheck> = { ok: CircleCheck, partial: CircleDot, manual: ClipboardPaste };

/** Liste des sites et de leur compatibilité, d'après les tests réels. */
export function CompatibleSites() {
  const t = useTranslations("adapt.offer.sources");
  const groups: PlatformStatus[] = ["ok", "partial", "manual"];
  return (
    <details className="mt-4 rounded-lg border border-border text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 font-medium [&::-webkit-details-marker]:hidden">
        {t("listTitle")}
        <span className="text-xs text-muted-foreground">{t("listHint")}</span>
      </summary>
      <div className="space-y-4 border-t border-border px-4 py-4">
        {groups.map((status) => {
          const Icon = ICONS[status];
          const items = PLATFORMS.filter((p) => p.status === status);
          return (
            <div key={status}>
              <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <Icon className={`size-3.5 ${status === "ok" ? "text-primary" : ""}`} strokeWidth={2} aria-hidden />
                {t(`status.${status}`)}
              </p>
              <p className="mt-1.5 leading-relaxed">{items.map((p) => p.name).join(" · ")}</p>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">{t("others")}</p>
      </div>
    </details>
  );
}
