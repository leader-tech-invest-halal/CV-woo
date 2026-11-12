import { useTranslations } from "next-intl";

// CV → Offre → Analyse → Éditeur (DESIGN.md › StepIndicator).
const STEPS = ["resume", "offer", "analysis", "editor"] as const;

export function StepIndicator({ current = 0 }: { current?: number }) {
  const t = useTranslations("dashboard.steps");
  return (
    <ol className="flex items-center gap-2 text-sm">
      {STEPS.map((step, i) => {
        const active = i === current;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-medium tabular-nums ${
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{t(step)}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-border sm:w-8" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
