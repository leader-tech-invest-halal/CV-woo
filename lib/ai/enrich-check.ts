import { z } from "zod";
import { checkRewrite, normalize } from "./guardrails";
import type { Block, EnrichResult, ProfileAnswer, ProfileFigure, Rewrite } from "@/lib/cv/types";

// Contrôles du code sur les propositions « Enrichir mon profil » (testables sans IA).

export const EnrichSchema = z.object({
  rewrites: z.array(
    z.object({
      block_id: z.string(),
      new_text: z.string(),
      reason: z.string(),
      skills_used: z.array(z.string()).describe("Compétences de la liste des réponses intégrées dans ce bloc"),
    }),
  ),
  unplaced: z.array(z.string()).describe("Compétences confirmées qu'aucun bloc modifiable ne permet d'intégrer"),
});

export function checkEnrichment(
  parsed: z.infer<typeof EnrichSchema>,
  input: { answers: ProfileAnswer[]; current: Record<string, string>; figures?: ProfileFigure[] },
  byId: Map<string, Block>,
  editable: Set<string>,
): EnrichResult {
  const current = (id: string) => input.current[id] ?? byId.get(id)?.text ?? "";
  const confirmed = input.answers.filter((a) => a.answer === "yes");
  const similarOnly = input.answers.filter((a) => a.answer === "similar");
  // Ce que la personne a écrit compte comme source, au même titre que son CV.
  // Le nom d'une compétence « similaire » n'en fait pas partie : elle ne la possède pas.
  const source = [
    ...[...byId.values()].map((b) => b.text),
    ...Object.values(input.current),
    ...input.answers.flatMap((a) => [a.answer === "yes" ? a.skill : "", a.context, a.duration, a.example, a.similar]),
    // Les chiffres réels donnés par la personne sont des faits qu'elle a fournis
    ...(input.figures ?? []).map((f) => f.text),
  ]
    .filter(Boolean)
    .join("\n");

  const rewrites: Rewrite[] = [];
  const done = new Set<string>();
  const placed = new Set<string>();
  for (const r of parsed.rewrites) {
    const block = byId.get(r.block_id);
    const base = current(r.block_id);
    const after = r.new_text.replace(/\s+/g, " ").trim();
    if (!block || !editable.has(r.block_id) || done.has(r.block_id) || !after || after === base) continue;
    if (after.length > base.length * 2 + 120) continue; // la proposition absorberait d'autres blocs
    const skills = r.skills_used.filter((s) => confirmed.some((a) => normalize(a.skill) === normalize(s)));
    const flags = checkRewrite(after, [], source, []);
    // « Expérience similaire » : la compétence elle-même ne doit jamais apparaître
    for (const a of similarOnly) {
      const skill = normalize(a.skill);
      if (normalize(after).includes(skill) && !normalize(base).includes(skill)) flags.push(`similar:${a.skill}`);
    }
    done.add(r.block_id);
    skills.forEach((s) => placed.add(normalize(s)));
    rewrites.push({ blockId: r.block_id, before: block.text, after, reason: r.reason, keywords: skills, flags, source: "profile", skills });
  }
  const unplaced = confirmed.map((a) => a.skill).filter((s) => !placed.has(normalize(s)));
  return { rewrites, unplaced };
}
