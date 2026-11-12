import { CircleCheck, CircleAlert, CircleMinus } from "lucide-react";

// Compétence présente (émeraude), non démontrée (ambre), absente (gris).
export type SkillState = "present" | "weak" | "missing";

const styles: Record<SkillState, string> = {
  present: "bg-accent text-accent-foreground",
  weak: "bg-warning/15 text-[oklch(0.47_0.12_60)]",
  missing: "bg-muted text-muted-foreground",
};

const icons = { present: CircleCheck, weak: CircleAlert, missing: CircleMinus };

export function SkillChip({ state, children }: { state: SkillState; children: string }) {
  const Icon = icons[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[state]}`}>
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  );
}
