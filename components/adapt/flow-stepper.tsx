"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

export const FLOW = ["resume", "offer", "requirements", "compare", "changes", "review", "preview"] as const;
export type FlowStep = (typeof FLOW)[number];

/**
 * Progression du parcours en 7 étapes.
 * Ordinateur : toutes les étapes avec leur nom. Mobile : « Étape 3 sur 7 » + barre de progression.
 * Les étapes déjà atteintes sont cliquables pour revenir en arrière.
 */
export function FlowStepper({
  current,
  reached,
  onGo,
}: {
  current: FlowStep;
  reached: number; // index de l'étape la plus avancée atteinte
  onGo: (step: FlowStep) => void;
}) {
  const t = useTranslations("adapt.flow");
  const index = FLOW.indexOf(current);

  return (
    <nav aria-label={t("progress", { current: index + 1, total: FLOW.length })}>
      {/* Mobile */}
      <div className="md:hidden">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">{t(`steps.${current}`)}</span>
          <span className="text-muted-foreground tabular-nums">{t("progress", { current: index + 1, total: FLOW.length })}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${((index + 1) / FLOW.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Ordinateur */}
      <ol className="hidden items-start md:flex">
        {FLOW.map((step, i) => {
          const done = i < index;
          const active = i === index;
          const clickable = i <= reached && !active;
          const bubble = (
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors ${
                active
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                  : done || i <= reached
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : i + 1}
            </span>
          );
          const label = (
            <span className={`mt-1.5 text-xs leading-tight ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {t(`steps.${step}`)}
            </span>
          );
          return (
            <li key={step} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span
                  className={`absolute top-3.5 right-1/2 h-0.5 w-full -translate-y-1/2 ${i <= index ? "bg-primary/40" : "bg-border"}`}
                  style={{ zIndex: 0 }}
                  aria-hidden
                />
              )}
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onGo(step)}
                  className="relative z-10 flex flex-col items-center rounded-md px-1 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {bubble}
                  {label}
                </button>
              ) : (
                <span className="relative z-10 flex flex-col items-center px-1" aria-current={active ? "step" : undefined}>
                  {bubble}
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
