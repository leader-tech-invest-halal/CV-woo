import { use } from "react";
import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  Check,
  ClipboardPaste,
  FileText,
  Gauge,
  Lock,
  ScanText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HeroPreview } from "@/components/marketing/hero-preview";

const STEPS = [
  { icon: Upload, key: "step1" },
  { icon: ClipboardPaste, key: "step2" },
  { icon: FileText, key: "step3" },
] as const;

const FEATURES = [
  { icon: ShieldCheck, key: "noInvent" },
  { icon: ScanText, key: "ats" },
  { icon: Gauge, key: "score" },
  { icon: Lock, key: "privacy" },
] as const;

export default function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations();

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-b from-surface to-background">
        <div className="mx-auto grid max-w-[1120px] items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Badge>{t("hero.badge")}</Badge>
            <h1 className="mt-5 text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">{t("hero.subtitle")}</p>
            <div className="mt-8 flex flex-col flex-wrap gap-3 sm:flex-row">
              <Link href="/adapt" className={buttonClass("primary", "lg")}>
                {t("hero.cta")}
                <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
              </Link>
              <Link href="/#how" className={buttonClass("ghost", "lg")}>
                {t("hero.secondary")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t("hero.note")}</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">{t("how.title")}</h2>
          <p className="mt-2 text-muted-foreground">{t("how.subtitle")}</p>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, key }, i) => (
              <li key={key}>
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-md bg-accent text-accent-foreground">
                    <Icon className="size-5" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground tabular-nums">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t(`how.${key}.title`)}</h3>
                <p className="mt-1.5 text-muted-foreground">{t(`how.${key}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Avantages */}
      <section id="features" className="scroll-mt-20 bg-surface">
        <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">{t("features.title")}</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, key }) => (
              <Card key={key} className="p-6">
                <Icon className="size-5 text-primary" strokeWidth={1.5} aria-hidden />
                <h3 className="mt-4 font-semibold">{t(`features.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t(`features.${key}.text`)}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Honnêteté */}
      <section>
        <div className="mx-auto grid max-w-[1120px] gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-20">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("honesty.title")}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("honesty.text")}</p>
          </div>
          <ul className="space-y-4 self-center">
            {(["item1", "item2", "item3"] as const).map((k) => (
              <li key={k} className="flex gap-3">
                <Check className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                <span>{t(`honesty.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 bg-surface">
        <div className="mx-auto max-w-[960px] px-4 py-16 sm:px-6 md:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">{t("faq.title")}</h2>
          <div className="mt-8 divide-y divide-border rounded-lg border border-border bg-card">
            {([1, 2, 3, 4] as const).map((n) => (
              <details key={n} className="group p-5">
                <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                  {t(`faq.q${n}`)}
                  <span
                    className="text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45"
                    aria-hidden
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-muted-foreground">{t(`faq.a${n}`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Appel final */}
      <section>
        <div className="mx-auto max-w-[1120px] px-4 py-16 text-center sm:px-6 md:py-24">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-balance">
            {t("finalCta.title")}
          </h2>
          <Link href="/adapt" className={buttonClass("outline", "lg", "mt-8")}>
            {t("finalCta.cta")}
            <ArrowRight className="size-4" strokeWidth={1.75} aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
