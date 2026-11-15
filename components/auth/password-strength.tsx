"use client";

import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { passwordIssues, passwordStrength, PASSWORD_MIN } from "@/lib/auth/password";

// Jauge de solidité et règles du mot de passe, mises à jour pendant la saisie.

const BAR = ["bg-destructive", "bg-destructive", "bg-warning", "bg-primary/70", "bg-primary"];

export function PasswordStrength({ password, email }: { password: string; email: string }) {
  const t = useTranslations("auth.passwordRules");
  const issues = passwordIssues(password, email);
  const score = passwordStrength(password, email);

  const rules = [
    { ok: !issues.includes("too_short") && !issues.includes("too_long"), label: t("ruleLength", { min: PASSWORD_MIN }) },
    { ok: !issues.includes("needs_letter") && !issues.includes("needs_digit"), label: t("ruleMix") },
    {
      ok: !issues.includes("too_common") && !issues.includes("contains_email") && !issues.includes("repetitive"),
      label: t("ruleCommon"),
    },
  ];

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${password && score >= i ? BAR[score] : "bg-muted"}`} />
        ))}
      </div>
      {password && <p className="mt-1 text-xs font-medium">{t(`strength.${score}`)}</p>}
      <ul className="mt-1.5 space-y-0.5 text-xs">
        {rules.map((r) => (
          <li key={r.label} className={`flex items-center gap-1.5 ${r.ok ? "text-primary" : "text-muted-foreground"}`}>
            {r.ok ? <Check className="size-3.5" strokeWidth={2} aria-hidden /> : <X className="size-3.5" strokeWidth={2} aria-hidden />}
            <span>
              {r.label}
              <span className="sr-only"> : {r.ok ? t("ok") : t("notOk")}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
