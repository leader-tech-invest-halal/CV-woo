"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, LoaderCircle, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Suppression définitive du compte (droit à l'effacement RGPD).
 * Confirmation en tapant un mot, puis appel de la fonction sécurisée delete_my_account(),
 * qui ne peut supprimer que le compte de la personne connectée.
 */
export function DeleteAccount() {
  const t = useTranslations("profile.delete");
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);
  const word = t("confirmWord");

  const remove = async () => {
    setBusy(true);
    setError(false);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      setError(true);
      setBusy(false);
      return;
    }
    await supabase.auth.signOut();
    setDone(true);
    setBusy(false);
  };

  if (done) {
    return (
      <div role="status" className="rounded-lg border border-primary/30 bg-accent p-4 text-sm text-accent-foreground">
        <p className="flex items-center gap-2 font-medium">
          <CircleCheck className="size-4" strokeWidth={1.75} aria-hidden />
          {t("done")}
        </p>
        <Link href="/" className={buttonClass("outline", "md", "mt-3")}>
          {t("home")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{t("text")}</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md border border-destructive/40 px-4 text-sm font-medium text-destructive hover:bg-destructive/5"
        >
          <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
          {t("button")}
        </button>
      ) : (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <label htmlFor="confirm-delete" className="text-sm font-medium">
            {t("confirmLabel", { word })}
          </label>
          <input
            id="confirm-delete"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t("error")}
            </p>
          )}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)} disabled={busy}>
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={typed.trim().toUpperCase() !== word.toUpperCase() || busy}
              onClick={remove}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {t("confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
