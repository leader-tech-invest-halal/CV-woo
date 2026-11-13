"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LogIn, LogOut } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

/** Affiche l'e-mail de la personne connectée et le bouton de déconnexion, ou un lien de connexion. */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (email === undefined) return null;

  if (!email) {
    return (
      <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
        <LogIn className="size-4" strokeWidth={1.5} aria-hidden />
        {t("navLogin")}
      </Link>
    );
  }

  return (
    <div className={compact ? "flex items-center" : "space-y-1"}>
      {!compact && <p className="truncate px-3 text-xs text-muted-foreground" title={email}>{email}</p>}
      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          router.refresh();
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LogOut className="size-4" strokeWidth={1.5} aria-hidden />
        {t("logout")}
      </button>
    </div>
  );
}
