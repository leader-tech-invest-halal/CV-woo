"use client";

import { useTranslations } from "next-intl";
import { Files, History, LayoutDashboard, Sparkles, User, type LucideIcon } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

type Item = { href: string; key: "dashboard" | "adapt" | "resumes" | "history" | "profile"; icon: LucideIcon; ready: boolean };

// Les pages marquées ready: false arrivent avec les comptes utilisateurs (étape 10).
const ITEMS: Item[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, ready: true },
  { href: "/adapt", key: "adapt", icon: Sparkles, ready: true },
  { href: "/resumes", key: "resumes", icon: Files, ready: false },
  { href: "/history", key: "history", icon: History, ready: false },
  { href: "/profile", key: "profile", icon: User, ready: false },
];

/** Barre latérale (≥ 768 px). */
export function SidebarNav() {
  const t = useTranslations("app.nav");
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {ITEMS.map(({ href, key, icon: Icon, ready }) => {
        const active = pathname.startsWith(href);
        const cls = `flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${
          active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
        }`;
        const content = (
          <>
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
            <span className="flex-1">{t(key)}</span>
            {!ready && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("soon")}</span>
            )}
          </>
        );
        return ready ? (
          <Link key={key} href={href} className={`${cls} hover:bg-muted hover:text-foreground`} aria-current={active ? "page" : undefined}>
            {content}
          </Link>
        ) : (
          <span key={key} className={`${cls} cursor-not-allowed opacity-70`} aria-disabled>
            {content}
          </span>
        );
      })}
    </nav>
  );
}

/** Barre de navigation en bas (mobile). */
export function BottomNav() {
  const t = useTranslations("app.nav");
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      {ITEMS.map(({ href, key, icon: Icon, ready }) => {
        const active = pathname.startsWith(href);
        const cls = `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${
          active ? "font-medium text-primary" : "text-muted-foreground"
        }`;
        const content = (
          <>
            <Icon className="size-5" strokeWidth={1.5} aria-hidden />
            {t(key)}
          </>
        );
        return ready ? (
          <Link key={key} href={href} className={cls} aria-current={active ? "page" : undefined}>
            {content}
          </Link>
        ) : (
          <span key={key} className={`${cls} opacity-50`} aria-disabled>
            {content}
          </span>
        );
      })}
    </nav>
  );
}
