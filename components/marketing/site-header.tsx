import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { buttonClass } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/user-menu";

export function SiteHeader() {
  const t = useTranslations("nav");
  const links = [
    { href: "/#how", label: t("how") },
    { href: "/#features", label: t("features") },
    { href: "/#faq", label: t("faq") },
    { href: "/ats-checker", label: t("ats") },
    { href: "/pricing", label: t("pricing") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex sm:items-center">
            <UserMenu compact />
            <LocaleSwitcher />
          </div>
          <Link href="/adapt" className={buttonClass("outline", "md")}>
            {t("cta")}
          </Link>
        </div>
      </div>
    </header>
  );
}
