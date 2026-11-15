"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LoaderCircle, MailCheck } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import { passwordIssues, PASSWORD_MAX } from "@/lib/auth/password";
import { PasswordStrength } from "./password-strength";

type Mode = "signup" | "login" | "forgot";

// Codes d'erreur Supabase Auth → messages affichés
function errorKey(code: string | undefined, message: string): string {
  switch (code) {
    case "user_already_exists":
    case "email_exists":
      return "user_already_exists";
    case "invalid_credentials":
      return "invalid_credentials";
    case "email_not_confirmed":
      return "email_not_confirmed";
    case "weak_password":
      return "weak_password";
    case "email_address_invalid":
    case "validation_failed":
      return "invalid_email";
    case "signup_disabled":
      return "signup_disabled";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "rate_limit";
  }
  if (/already registered/i.test(message)) return "user_already_exists";
  if (/invalid login/i.test(message)) return "invalid_credentials";
  return "unknown";
}

/** Formulaire e-mail + mot de passe (inscription ou connexion). */
export function AuthForm({ initialMode = "signup", onSuccess }: { initialMode?: Mode; onSuccess: () => void }) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitingConfirmation, setWaitingConfirmation] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // En attente de confirmation de l'e-mail : dès que la personne revient sur l'onglet
  // après avoir cliqué sur le lien, on détecte la session et on continue.
  useEffect(() => {
    if (!waitingConfirmation) return;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) onSuccess();
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => session && onSuccess());
    window.addEventListener("focus", check);
    const id = setInterval(check, 4000);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("focus", check);
      clearInterval(id);
    };
  }, [waitingConfirmation, supabase, onSuccess]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Mot de passe oublié : même message que le compte existe ou non (pas de fuite d'information)
    if (mode === "forgot") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("invalid_email");
      setBusy(true);
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/reset-password`,
      });
      setBusy(false);
      if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) return setError("rate_limit");
      setResetSent(true);
      return;
    }
    // Inscription : règles complètes. Connexion : on n'empêche pas un ancien mot de passe plus court.
    if (mode === "signup" && passwordIssues(password, email).length > 0) return setError("weak_password");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { locale },
            emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/${locale}/adapt`,
          },
        });
        if (error) return setError(errorKey(error.code, error.message));
        // E-mail déjà inscrit : Supabase renvoie un utilisateur sans identité et n'envoie rien.
        // On affiche le même écran que pour une nouvelle inscription, pour ne pas révéler
        // quelles adresses ont un compte ; l'écran rappelle de se connecter si besoin.
        if (data.session) onSuccess();
        else setWaitingConfirmation(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return setError(errorKey(error.code, error.message));
        onSuccess();
      }
    } catch {
      setError("unknown");
    } finally {
      setBusy(false);
    }
  };

  if (resetSent) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-10 text-primary" strokeWidth={1.5} aria-hidden />
        <h3 className="mt-3 font-semibold">{t("forgot.sentTitle")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t("forgot.sentText", { email })}</p>
        <button
          type="button"
          className={buttonClass("outline", "md", "mt-5")}
          onClick={() => {
            setResetSent(false);
            setMode("login");
          }}
        >
          {t("forgot.back")}
        </button>
      </div>
    );
  }

  if (waitingConfirmation) {
    return (
      <div className="text-center">
        <MailCheck className="mx-auto size-10 text-primary" strokeWidth={1.5} aria-hidden />
        <h3 className="mt-3 font-semibold">{t("checkEmailTitle")}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{t("checkEmailText", { email })}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("checkEmailExisting")}</p>
        <button
          type="button"
          className={buttonClass("outline", "md", "mt-5")}
          onClick={async () => {
            const { data } = await supabase.auth.getSession();
            if (data.session) onSuccess();
            else {
              setWaitingConfirmation(false);
              setMode("login");
            }
          }}
        >
          {t("resend")}
        </button>
      </div>
    );
  }

  const field =
    "mt-1.5 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <form onSubmit={submit} noValidate>
      <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
        {(["signup", "login"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`min-h-10 flex-1 rounded-md text-sm font-medium ${
              mode === m ? "bg-background shadow-card" : "text-muted-foreground"
            }`}
          >
            {m === "signup" ? t("signupTab") : t("loginTab")}
          </button>
        ))}
      </div>

      <label className="mt-5 block text-sm font-medium" htmlFor="auth-email">
        {t("email")}
      </label>
      <input
        id="auth-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={field}
      />

      {mode === "forgot" ? (
        <p className="mt-3 text-sm text-muted-foreground">{t("forgot.text")}</p>
      ) : (
      <>
      <div className="mt-4 flex items-baseline justify-between">
        <label className="text-sm font-medium" htmlFor="auth-password">
          {t("password")}
        </label>
        <button type="button" className="-my-3 -mr-2 min-h-11 px-2 text-xs text-muted-foreground underline" onClick={() => setShowPassword((s) => !s)}>
          {showPassword ? t("hide") : t("show")}
        </button>
      </div>
      <input
        id="auth-password"
        type={showPassword ? "text" : "password"}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        required
        maxLength={PASSWORD_MAX}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
      />
      {mode === "signup" && <PasswordStrength password={password} email={email} />}
      {mode === "login" && (
        <button
          type="button"
          className="mt-1 -ml-1 min-h-9 px-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => {
            setMode("forgot");
            setError(null);
          }}
        >
          {t("forgot.link")}
        </button>
      )}
      </>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-destructive/5 p-3 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !email || (mode !== "forgot" && !password)}
        className={buttonClass("primary", "md", "mt-5 w-full")}
      >
        {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
        {busy ? t("loading") : mode === "signup" ? t("signup") : mode === "forgot" ? t("forgot.submit") : t("login")}
      </button>
      {mode === "forgot" && (
        <button
          type="button"
          className="mt-2 min-h-11 w-full text-sm text-muted-foreground underline underline-offset-2"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          {t("forgot.back")}
        </button>
      )}
      {mode === "signup" && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t.rich("consent", {
            privacy: (chunks) => (
              <Link href="/legal/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </form>
  );
}
