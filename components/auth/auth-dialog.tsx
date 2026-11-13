"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { AuthForm } from "./auth-form";

/** Fenêtre « créez votre compte » affichée après l'adaptation offerte, sans quitter la page. */
export function AuthDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const t = useTranslations("auth");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="auth-dialog-title"
      className="m-auto w-[min(100%-2rem,440px)] rounded-xl border border-border bg-card p-0 text-card-foreground shadow-card backdrop:bg-black/40"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="auth-dialog-title" className="text-lg font-semibold">
            {t("gateTitle")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="-m-2 rounded-md p-2 text-muted-foreground hover:bg-muted">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <p className="mt-2 mb-5 text-sm text-muted-foreground">{t("gateText")}</p>
        {open && <AuthForm onSuccess={onSuccess} />}
      </div>
    </dialog>
  );
}
