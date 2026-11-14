import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { DeleteAccount } from "@/components/auth/delete-account";
import { getCurrentUser } from "@/lib/supabase/server";
import { monthlyUsage } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("profile");
  const { supabase, user } = await getCurrentUser();

  if (!user) {
    return (
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("guest")}</p>
        <Link href="/login" className={buttonClass("primary", "md", "mt-5")}>
          {t("login")}
        </Link>
      </Card>
    );
  }

  const usage = await monthlyUsage(supabase, user.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card className="p-6">
        <h2 className="font-semibold">{t("account")}</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("email")}</dt>
            <dd className="mt-0.5 font-medium break-all">{user.email}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("usage")}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{t("usageValue", { used: usage.used, total: usage.quota })}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold">{t("data")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("dataText")}</p>
        <Link href="/legal/privacy" className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t("privacyLink")}
        </Link>
      </Card>

      <Card className="border-destructive/30 p-6">
        <h2 className="font-semibold text-destructive">{t("delete.title")}</h2>
        <div className="mt-2">
          <DeleteAccount />
        </div>
      </Card>
    </div>
  );
}
