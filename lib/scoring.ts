import type { SkillMatch } from "@/lib/cv/types";

// Score de correspondance calculé par le code (reproductible), jamais deviné par l'IA :
// compétences obligatoires 60 %, souhaitées 25 %, mots-clés 15 %.
// Une compétence ne compte que si une preuve a été trouvée dans le CV.
const WEIGHTS = { required: 0.6, nice: 0.25, keyword: 0.15 } as const;
const VALUE = { present: 1, weak: 0.5, missing: 0 } as const;

export function computeScore(matches: SkillMatch[]): number {
  let total = 0;
  let weightSum = 0;
  for (const importance of Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]) {
    const group = matches.filter((m) => m.importance === importance);
    if (group.length === 0) continue;
    const ratio = group.reduce((s, m) => s + VALUE[m.status], 0) / group.length;
    total += ratio * WEIGHTS[importance];
    weightSum += WEIGHTS[importance];
  }
  return weightSum === 0 ? 0 : Math.round((total / weightSum) * 100);
}
