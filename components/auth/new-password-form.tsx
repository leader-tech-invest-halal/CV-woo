"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { passwordIssues, PASSWORD_MAX } from "@/lib/auth/password";
import { PasswordStrength } from "./password-strength";

/**
 * Choix d'un nouveau mot de passe : après le lien « Mot de passe oublié » (session ouverte
 * par le lien), ou depuis le profil. Supabase n'accepte la modification que pour la session en cours.
 */
export function NewPasswordForm({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("auth.reset");
  const te = useTranslations("auth.errors");
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null | undefined>(undefined); // undefined = vérification en cours
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (passwordIssues(password, email ?? "").length) return setError("weak_password");
    if (password !== confirm) return setError("password_mismatch");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.code === "weak_password" ? "weak_password" : error.code === "same_password" ? "same_password" : "unknown");
      return;
    }
    setPassword("");
    setConfirm("");
    setDone(true);
  };

  if (email === undefined) return <LoaderCircle className="size-5 animate-spin text-primary" aria-label={t("checking")} />;

  if (email === null) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">{t("expired")}</p>
        <Link href="/login" className={buttonClass("primary", "md", "mt-4")}>
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status">
        <p className="flex items-center gap-2 text-sm font-medium text-primary">
          <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
          {t("done")}
        </p>
        {!compact && (
          <Link href="/adapt" className={buttonClass("primary", "md", "mt-4")}>
            {t("continue")}
          </Link>
        )}
      </div>
    );
  }

  const field =
    "mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={submit} noValidate className="max-w-md">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium" htmlFor="new-password">
          {t("newPassword")}
        </label>
        <button type="button" className="-my-3 -mr-2 min-h-11 px-2 text-xs text-muted-foreground underline" onClick={() => setShow((s) => !s)}>
          {show ? t("hide") : t("show")}
        </button>
      </div>
      <input
        id="new-password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
      />
      <PasswordStrength password={password} email={email} />
      <label className="mt-4 block text-sm font-medium" htmlFor="confirm-password">
        {t("confirm")}
      </label>
      <input
        id="confirm-password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        maxLength={PASSWORD_MAX}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className={field}
      />
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-destructive/5 p-3 text-sm text-destructive">
          {te(error)}
        </p>
      )}
      <button type="submit" disabled={busy || !password || !confirm} className={buttonClass("primary", "md", "mt-5")}>
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {t("save")}
      </button>
    </form>
  );
}
