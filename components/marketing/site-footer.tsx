import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function SiteFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <Logo />
          <p className="text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <LocaleSwitcher className="-ml-3 sm:ml-0 sm:-mr-3" />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} CV Woo. {t("rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
