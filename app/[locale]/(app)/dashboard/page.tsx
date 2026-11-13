import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, FileText, Gauge, Lightbulb, ShieldCheck } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { StepIndicator } from "@/components/app/step-indicator";
import { getCurrentUser } from "@/lib/supabase/server";
import { monthlyUsage } from "@/lib/access";

// Le tableau de bord dépend de la session : il est rendu à chaque visite.
export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  // Vrai compteur pour une personne connectée ; offre d'essai pour un visiteur
  const { supabase, user } = await getCurrentUser();
  const usage = user ? await monthlyUsage(supabase, user.id) : null;
  const name = user?.email?.split("@")[0];

  return (
    <div className="space-y-6">
      {/* En-tête + action principale */}
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {name ? t("greetingUser", { email: name }) : t("greeting")}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6 overflow-x-auto pb-1">
          <StepIndicator current={0} />
        </div>
        <Link href="/adapt" className={buttonClass("primary", "lg", "mt-6 w-full sm:w-auto")}>
          {t("cta")}
          <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
        </Link>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {/* Mes CV : rien n'est conservé pour l'instant, on le dit clairement */}
          <section>
            <h2 className="mb-3 font-semibold">{t("resumes.title")}</h2>
            <Card className="flex flex-col items-center px-6 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                <ShieldCheck className="size-6" strokeWidth={1.5} aria-hidden />
              </span>
              <p className="mt-4 font-medium">{t("resumes.emptyTitle")}</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("resumes.emptyText")}</p>
              <Link href="/adapt" className={buttonClass("outline", "md", "mt-5")}>
                <FileText className="size-4" strokeWidth={1.5} aria-hidden />
                {t("resumes.import")}
              </Link>
            </Card>
          </section>

          {/* Analyses récentes : fonction annoncée comme future */}
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
          <Card className="p-5">
            <h2 className="font-semibold">{t("quota.title")}</h2>
            {usage ? (
              <>
                <div className="mt-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                    <span>{t("quota.analyses")}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {t("quota.used", { used: usage.used, total: usage.quota })}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={usage.quota}
                    aria-valuenow={usage.used}
                    aria-label={t("quota.analyses")}
                  >
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (usage.used / usage.quota) * 100)}%` }}
                    />
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">{t("quota.reset")}</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium">{t("quota.guestTitle")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("quota.guestText")}</p>
                <Link href="/login?mode=signup" className={buttonClass("outline", "md", "mt-4 w-full")}>
                  {t("quota.guestCta")}
                </Link>
              </>
            )}
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
