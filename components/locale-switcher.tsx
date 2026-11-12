"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const other = locale === "fr" ? "en" : "fr";

  return (
    <Link
      href={pathname}
      locale={other}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground ${className}`}
    >
      <Globe className="size-4" strokeWidth={1.5} aria-hidden />
      {t("language")}
    </Link>
  );
}
