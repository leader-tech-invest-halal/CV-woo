import { useTranslations } from "next-intl";
import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScoreGauge } from "@/components/analysis/score-gauge";
import { SkillChip } from "@/components/analysis/skill-chip";

// Aperçu illustratif d'un résultat d'analyse : exemple fictif, clairement signalé comme tel.
// La reformulation montrée respecte la règle du produit : aucun chiffre ni fait ajouté.
export function HeroPreview() {
  const t = useTranslations("preview");
  return (
    <Card className="w-full max-w-md p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-[oklch(0.42_0.1_60)]">
            {t("badge")}
          </span>
          <p className="mt-1 font-semibold">{t("title")}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t("disclaimer")}</p>
        </div>
        <ScoreGauge value={78} label={t("score")} size={96} />
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("present")}</p>
          <div className="flex flex-wrap gap-1.5">
            <SkillChip state="present">React</SkillChip>
            <SkillChip state="present">TypeScript</SkillChip>
            <SkillChip state="present">Figma</SkillChip>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("weak")}</p>
          <div className="flex flex-wrap gap-1.5">
            <SkillChip state="weak">Tests</SkillChip>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("missing")}</p>
          <div className="flex flex-wrap gap-1.5">
            <SkillChip state="missing">GraphQL</SkillChip>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-border bg-surface p-3 text-sm">
        <p className="flex gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
          <span>{t("change")}</span>
        </p>
        <p className="mt-1.5 pl-6 text-xs text-muted-foreground">{t("source")}</p>
      </div>
    </Card>
  );
}
