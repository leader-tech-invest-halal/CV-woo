import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { PUBLISHER } from "@/lib/legal";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.notice" });
  return { title: t("title") };
}

export default async function NoticePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const format = await getFormatter();
  const name = PUBLISHER.name ?? `[${t("toComplete")}]`;
  const email = PUBLISHER.email ?? `[${t("toComplete")}]`;

  return (
    <LegalPage
      title={t("notice.title")}
      updated={t("updated", { date: format.dateTime(new Date(PUBLISHER.updated), { dateStyle: "long" }) })}
    >
      <LegalSection title={t("notice.publisherTitle")}>
        <p>{t("notice.publisher", { name, email })}</p>
      </LegalSection>
      <LegalSection title={t("notice.directorTitle")}>
        <p>{t("notice.director", { name })}</p>
      </LegalSection>
      <LegalSection title={t("notice.hostTitle")}>
        <p>{t("notice.host")}</p>
      </LegalSection>
      <LegalSection title={t("notice.dbTitle")}>
        <p>{t("notice.db")}</p>
      </LegalSection>
      <LegalSection title={t("notice.ipTitle")}>
        <p>{t("notice.ip")}</p>
      </LegalSection>
      <LegalSection title={t("notice.betaTitle")}>
        <p>{t("notice.beta")}</p>
      </LegalSection>
    </LegalPage>
  );
}
