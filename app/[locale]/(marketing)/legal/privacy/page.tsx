import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { PUBLISHER } from "@/lib/legal";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const name = PUBLISHER.name ?? `[${t("toComplete")}]`;
  const email = PUBLISHER.email ?? `[${t("toComplete")}]`;
  const p = (k: string) => t(`privacy.${k}`);

  return (
    <LegalPage
      title={p("title")}
      updated={t("updated", { date: format.dateTime(new Date(PUBLISHER.updated), { dateStyle: "long" }) })}
      intro={p("intro")}
    >
      <LegalSection title={p("controllerTitle")}>
        <p>{t("privacy.controller", { name, email })}</p>
      </LegalSection>
      <LegalSection title={p("cvTitle")}>
        <p>{p("cv1")}</p>
        <p>{p("cv2")}</p>
        <p>{p("cv3")}</p>
      </LegalSection>
      <LegalSection title={p("accountTitle")}>
        <p>{p("account")}</p>
      </LegalSection>
      <LegalSection title={p("trialTitle")}>
        <p>{p("trial")}</p>
      </LegalSection>
      <LegalSection title={p("cookiesTitle")}>
        <p>{p("cookies")}</p>
      </LegalSection>
      <LegalSection title={p("processorsTitle")}>
        <p>{p("processors")}</p>
      </LegalSection>
      <LegalSection title={p("transfersTitle")}>
        <p>{p("transfers")}</p>
      </LegalSection>
      <LegalSection title={p("rightsTitle")}>
        <p>{t("privacy.rights", { email })}</p>
        <Link href="/profile" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
          {p("deleteLink")}
        </Link>
      </LegalSection>
    </LegalPage>
  );
}
