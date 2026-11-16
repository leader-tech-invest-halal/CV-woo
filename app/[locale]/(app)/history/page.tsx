import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { HistoryList } from "@/components/history/history-list";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "history" });
  return { title: t("title"), robots: { index: false } };
}

export default async function HistoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("history");
  const { user } = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {user ? (
        <HistoryList />
      ) : (
        <Card className="p-6">
          <p className="text-muted-foreground">{t("guest")}</p>
          <Link href="/login" className={buttonClass("primary", "md", "mt-4")}>
            {t("login")}
          </Link>
        </Card>
      )}
    </div>
  );
}
