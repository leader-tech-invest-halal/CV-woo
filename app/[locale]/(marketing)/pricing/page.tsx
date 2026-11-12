import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("pricing");

  return (
    <div className="mx-auto max-w-[960px] px-4 py-16 sm:px-6 md:py-24">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col p-6 ring-2 ring-primary">
          <h2 className="font-semibold">{t("betaTitle")}</h2>
          <p className="mt-4">
            <span className="text-4xl font-semibold tabular-nums">{t("betaPrice")}</span>{" "}
            <span className="text-muted-foreground">{t("betaPeriod")}</span>
          </p>
          <ul className="mt-6 flex-1 space-y-3 text-sm">
            {(["f1", "f2", "f3", "f4", "f5"] as const).map((k) => (
              <li key={k} className="flex gap-2.5">
                <Check className="size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                {t(k)}
              </li>
            ))}
          </ul>
          <Link href="/dashboard" className={buttonClass("primary", "md", "mt-8 w-full")}>
            {t("cta")}
          </Link>
        </Card>

        <Card className="flex flex-col p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t("soonTitle")}</h2>
            <Badge className="!bg-muted !text-muted-foreground">{t("soonBadge")}</Badge>
          </div>
          <p className="mt-4 text-muted-foreground">{t("soonText")}</p>
        </Card>
      </div>
    </div>
  );
}
