"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { AuthForm } from "./auth-form";

export function LoginPanel() {
  const t = useTranslations("auth");
  const router = useRouter();
  // ?mode=signup ouvre directement l'onglet « Créer un compte »
  const signup = useSearchParams().get("mode") === "signup";
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">{signup ? t("signupTitle") : t("loginTitle")}</h1>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">{signup ? t("signupSubtitle") : t("loginSubtitle")}</p>
      <AuthForm
        initialMode={signup ? "signup" : "login"}
        onSuccess={() => {
          router.push("/dashboard");
          router.refresh();
        }}
      />
    </Card>
  );
}
