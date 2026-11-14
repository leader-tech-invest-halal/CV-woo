import { useTranslations } from "next-intl";
import { Check, CircleCheck, Download, FileText } from "lucide-react";
import { ScoreGauge } from "@/components/analysis/score-gauge";
import { SkillChip } from "@/components/analysis/skill-chip";

// Petites illustrations d'interface pour la section « Comment ça marche ? ».
// Purement décoratives : masquées aux lecteurs d'écran (le texte de l'étape suffit).

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className="flex h-32 flex-col justify-center gap-2 rounded-md border border-border bg-surface p-3 select-none"
    >
      {children}
    </div>
  );
}

const Line = ({ w }: { w: string }) => <span className={`block h-1.5 rounded-full bg-border ${w}`} />;

export function StepVisual({ step }: { step: 1 | 2 | 3 | 4 }) {
  const t = useTranslations("how.visual");

  if (step === 1)
    return (
      <Frame>
        <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
          <span className="grid size-9 place-items-center rounded bg-accent text-accent-foreground">
            <FileText className="size-4.5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{t("file")}</p>
            <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full w-full rounded-full bg-primary" />
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground">
            <Check className="size-3.5" strokeWidth={2} />
            {t("ready")}
          </span>
        </div>
      </Frame>
    );

  if (step === 2)
    return (
      <Frame>
        <p className="text-[11px] font-medium text-muted-foreground">{t("offer")}</p>
        <Line w="w-11/12" />
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">React</span>
          <Line w="flex-1" />
        </div>
        <div className="flex items-center gap-1.5">
          <Line w="w-1/3" />
          <span className="rounded bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
            TypeScript
          </span>
          <Line w="flex-1" />
        </div>
        <Line w="w-2/3" />
      </Frame>
    );

  if (step === 3)
    return (
      <Frame>
        <div className="flex items-center gap-3">
          <ScoreGauge value={78} label="" size={72} />
          <div className="flex flex-col items-start gap-1.5">
            <SkillChip state="present">React</SkillChip>
            <SkillChip state="weak">Tests</SkillChip>
          </div>
        </div>
      </Frame>
    );

  return (
    <Frame>
      <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
        <CircleCheck className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
        <Line w="flex-1" />
        <span className="text-[11px] font-medium text-accent-foreground">{t("accept")}</span>
      </div>
      <div className="flex gap-2">
        {["PDF", "Word"].map((f) => (
          <span
            key={f}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground"
          >
            <Download className="size-3.5" strokeWidth={1.75} />
            {f}
          </span>
        ))}
      </div>
    </Frame>
  );
}
