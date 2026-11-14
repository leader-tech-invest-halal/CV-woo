import { useTranslations } from "next-intl";
import { ArrowDown, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScoreGauge } from "@/components/analysis/score-gauge";
import { SkillChip, type SkillState } from "@/components/analysis/skill-chip";

// Aperçu illustratif d'un résultat d'analyse : exemple fictif, clairement signalé comme tel.
// La reformulation montrée respecte la règle du produit : aucun chiffre ni fait ajouté.
const GROUPS: { state: SkillState; key: "present" | "weak" | "missing"; skills: string[] }[] = [
  { state: "present", key: "present", skills: ["React", "TypeScript", "Figma"] },
  { state: "weak", key: "weak", skills: ["Tests"] },
  { state: "missing", key: "missing", skills: ["GraphQL"] },
];

export function HeroPreview() {
  const t = useTranslations("preview");
  return (
    <div className="relative w-full max-w-md">
      {/* Halo discret derrière la carte */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-accent via-transparent to-accent/60 blur-2xl"
      />
      <Card className="w-full p-5 shadow-lg sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-[oklch(0.42_0.1_60)]">
              {t("badge")}
            </span>
            <p className="mt-2 font-semibold leading-snug">{t("title")}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">{t("disclaimer")}</p>
          </div>
          <ScoreGauge value={78} label={t("score")} size={96} />
        </div>

        <div className="mt-5 space-y-3 border-t border-border pt-4">
          {GROUPS.map(({ state, key, skills }) => (
            <div key={key}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t(key)}</p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <SkillChip key={s} state={state}>
                    {s}
                  </SkillChip>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-md border border-border bg-surface p-3 text-sm">
          <p className="flex items-center gap-2 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden />
            {t("changeLabel")}
          </p>
          <p className="mt-2 text-muted-foreground line-through decoration-muted-foreground/40">{t("before")}</p>
          <ArrowDown className="my-1 size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <p className="font-medium">{t("after")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("source")}</p>
        </div>
      </Card>
    </div>
  );
}
