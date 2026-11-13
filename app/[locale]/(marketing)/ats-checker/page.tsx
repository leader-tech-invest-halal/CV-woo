import { use } from "react";
import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { AtsChecker } from "@/components/ats/ats-checker";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ats.meta" });
  return { title: t("title"), description: t("description") };
}

// Page publique, sans inscription : porte d'entrée gratuite vers CV Woo (référencement Google).
export default function AtsCheckerPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations("ats.hero");

  return (
    <div className="bg-gradient-to-b from-surface to-background">
      <div className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 md:py-16">
        <div className="mb-8 text-center">
          <Badge>{t("badge")}</Badge>
          <h1 className="mt-4 text-3xl leading-tight font-bold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">{t("subtitle")}</p>
        </div>
        <AtsChecker />
      </div>
    </div>
  );
}
