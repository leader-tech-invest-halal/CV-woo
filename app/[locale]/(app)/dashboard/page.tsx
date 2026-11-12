import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ArrowRight, FileText, Gauge, Lightbulb, Upload } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StepIndicator } from "@/components/app/step-indicator";

// Valeurs de la bêta gratuite (migration 0002). Elles viendront de la base à l'étape 10.
const QUOTA = { analyses: { used: 0, total: 5 }, generations: { used: 0, total: 5 } };

export default function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("dashboard");

  return (
    <div className="space-y-6">
      {/* En-tête + action principale */}
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("greeting")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6 overflow-x-auto pb-1">
          <StepIndicator current={0} />
        </div>
        {/* Le parcours (import du CV) arrive à l'étape 6 */}
        <button type="button" disabled className={buttonClass("primary", "lg", "mt-6 w-full sm:w-auto")}>
          {t("cta")}
          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* Mes CV */}
          <section>
            <h2 className="mb-3 font-semibold">{t("resumes.title")}</h2>
            <Card className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                <FileText className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="mt-4 font-medium">{t("resumes.emptyTitle")}</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t("resumes.emptyText")}</p>
              <button type="button" disabled className={buttonClass("outline", "md", "mt-5")}>
                <Upload className="size-4" strokeWidth={1.5} aria-hidden />
                {t("resumes.import")}
              </button>
            </Card>
          </section>

          {/* Analyses récentes */}
          <section>
            <h2 className="mb-3 font-semibold">{t("analyses.title")}</h2>
            <Card className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Gauge className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="mt-4 font-medium">{t("analyses.emptyTitle")}</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t("analyses.emptyText")}</p>
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          {/* Quotas */}
          <Card className="p-5">
            <h2 className="font-semibold">{t("quota.title")}</h2>
            <div className="mt-4 space-y-4">
              {(["analyses", "generations"] as const).map((k) => {
                const { used, total } = QUOTA[k];
                return (
                  <div key={k}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                      <span>{t(`quota.${k}`)}</span>
                      <span className="text-muted-foreground tabular-nums">{t("quota.used", { used, total })}</span>
                    </div>
                    <div
                      className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={total}
                      aria-valuenow={used}
                      aria-label={t(`quota.${k}`)}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(used / total) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t("quota.reset")}</p>
          </Card>

          {/* Conseil */}
          <Card className="p-5">
            <p className="flex items-center gap-2 font-semibold">
              <Lightbulb className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
              {t("tip.title")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("tip.text")}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
