import { use, type ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { BottomNav, SidebarNav } from "@/components/app/app-nav";
import { UserMenu } from "@/components/auth/user-menu";

// La vérification de session (Supabase Auth) sera ajoutée à l'étape 10.
export default function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  setRequestLocale(use(params).locale);

  return (
    <div className="min-h-dvh bg-surface md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-background p-4 md:flex md:sticky md:top-0 md:h-dvh">
        <div className="px-2 py-2">
          <Logo href="/" />
        </div>
        <div className="mt-6 flex-1">
          <SidebarNav />
        </div>
        <UserMenu />
        <LocaleSwitcher />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <Logo href="/" />
          <div className="flex items-center">
            <UserMenu compact />
            <LocaleSwitcher />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[960px] flex-1 px-4 pt-8 pb-24 sm:px-6 md:pb-12">{children}</main>
      </div>

      <BottomNav />
    </div>
  );
}
