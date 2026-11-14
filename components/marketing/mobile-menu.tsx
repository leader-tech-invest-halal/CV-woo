"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { UserMenu } from "@/components/auth/user-menu";
import { LocaleSwitcher } from "@/components/locale-switcher";

/** Menu du site vitrine pour téléphone et tablette (sous 1024 px). */
export function MobileMenu({ links }: { links: { href: string; label: string }[] }) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();

  // Se ferme quand on change de page, et avec la touche Échap
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        className="grid size-11 place-items-center rounded-md text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      >
        {open ? <X className="size-5" strokeWidth={1.75} aria-hidden /> : <Menu className="size-5" strokeWidth={1.75} aria-hidden />}
      </button>

      {open && (
        <>
          {/* Voile : toucher à côté du menu le ferme */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 top-16 z-30 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <nav
            id={panelId}
            aria-label={t("openMenu")}
            className="absolute inset-x-0 top-16 z-40 border-b border-border bg-background px-4 pt-2 pb-4 shadow-card"
          >
            <ul className="mx-auto max-w-[1120px]">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-md px-3 text-base hover:bg-muted"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mx-auto mt-2 flex max-w-[1120px] items-center justify-between border-t border-border pt-3">
              <UserMenu compact={false} />
              <LocaleSwitcher />
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
