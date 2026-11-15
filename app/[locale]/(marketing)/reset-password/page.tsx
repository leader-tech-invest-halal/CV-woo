import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { NewPasswordForm } from "@/components/auth/new-password-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.reset" });
  return { title: t("title"), robots: { index: false } };
}

// Arrivée depuis le lien « Mot de passe oublié » : la session a été ouverte par /api/auth/callback.
export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth.reset");
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <Card className="p-6">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">{t("subtitle")}</p>
        <NewPasswordForm />
      </Card>
    </div>
  );
}
