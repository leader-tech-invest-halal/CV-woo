"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { AuthForm } from "./auth-form";

export function LoginPanel() {
  const t = useTranslations("auth");
  const router = useRouter();
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">{t("loginTitle")}</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      <AuthForm
        initialMode="login"
        onSuccess={() => {
          router.push("/dashboard");
          router.refresh();
        }}
      />
    </Card>
  );
}
