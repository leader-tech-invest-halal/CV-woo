import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getClient, logUsage, MODEL_SMART, toUserError } from "./client";
import { AnalyzeInput, rewritableIds } from "./analyze";
import { checkEnrichment, EnrichSchema } from "./enrich-check";
import type { Block, EnrichResult, ProfileAnswer } from "@/lib/cv/types";
import { UserFacingError } from "@/lib/cv/validate-file";

// Étape « Enrichir mon profil » : la personne a confirmé elle-même des compétences absentes
// de son CV. L'IA les intègre dans les rubriques existantes, à partir de ses seules réponses.
// Rien n'est ajouté sans confirmation, et chaque proposition reste à valider ensuite.

const text = (max: number) => z.string().trim().max(max).optional();

export const EnrichInput = z.object({
  locale: z.enum(["fr", "en"]),
  offerTitle: z.string().max(300),
  resume: AnalyzeInput.shape.resume,
  /** Texte actuellement proposé pour chaque bloc (réécritures de l'analyse), pour construire dessus. */
  current: z.record(z.string().max(20), z.string().max(3000)).default({}),
  answers: z
    .array(
      z.object({
        skill: z.string().trim().min(1).max(120),
        answer: z.enum(["yes", "similar"]),
        entryId: z.string().max(20).nullable(),
        context: text(300),
        duration: text(80),
        example: text(600),
        similar: text(300),
      }),
    )
    .min(1)
    .max(12),
});

const SYSTEM = `Tu aides un candidat à compléter son CV pour une offre d'emploi. Il a CONFIRMÉ LUI-MÊME posséder
certaines compétences absentes de son CV, et a parfois donné des précisions. Ton travail : intégrer ces
compétences confirmées dans les blocs existants du CV, naturellement, avec le vocabulaire de l'offre.

Où intégrer :
- La ligne de compétences la plus adaptée : ajoute le terme exact de la compétence (sans supprimer les autres).
- Si le candidat a indiqué une expérience ou une formation précise et donné un exemple : enrichis UNE puce
  de cette expérience avec cet exemple. Si cette expérience n'a pas de puce modifiable, utilise la ligne de compétences.
- Le résumé seulement si c'est la place la plus naturelle.
Pars toujours du « texte actuel » du bloc, garde tout son contenu, et n'intègre qu'à des blocs sans la mention
« (non modifiable) ». Un bloc n'apparaît qu'une fois : regroupe plusieurs compétences dans la même réécriture.
Si une compétence ne peut aller nulle part, mets-la dans "unplaced".

Réponse « expérience similaire » : le candidat N'A PAS cette compétence. N'écris jamais son nom ; décris
seulement l'expérience similaire qu'il a donnée, avec ses mots (ex. « Excel » pour « Power BI »).

RÈGLE ABSOLUE : n'utilise que des faits présents dans le CV ou dans les réponses du candidat. N'invente aucune
durée, chiffre, outil, employeur, résultat ni niveau. Si le candidat n'a pas donné de durée, n'en écris pas.
Ne déduis jamais une compétence de l'offre. Même langue que le CV. Écris reason en {LANG}, en une phrase simple.`;

function describeAnswer(a: ProfileAnswer, entries: Map<string, string>): string {
  const where =
    a.entryId && entries.has(a.entryId)
      ? `expérience [${a.entryId}] « ${entries.get(a.entryId)} »`
      : a.context
        ? `ailleurs : ${a.context}`
        : "non précisé";
  const parts =
    a.answer === "yes"
      ? [`« ${a.skill} » — OUI, le candidat la possède.`, `Où : ${where}.`]
      : [`« ${a.skill} » — EXPÉRIENCE SIMILAIRE seulement : ${a.similar || "non précisée"}.`, `Où : ${where}.`];
  if (a.duration) parts.push(`Depuis / pendant : ${a.duration}.`);
  if (a.example) parts.push(`Exemple donné : ${a.example}`);
  return "- " + parts.join(" ");
}

export async function enrich(input: z.infer<typeof EnrichInput>): Promise<EnrichResult> {
  const { blocks, structure } = input.resume;
  const byId = new Map<string, Block>(blocks.map((b) => [b.id, b]));
  const editable = rewritableIds(structure);
  const current = (id: string) => input.current[id] ?? byId.get(id)?.text ?? "";

  // Intitulés des expériences et formations, pour situer les réponses
  const entries = new Map<string, string>();
  for (const s of structure.sections) {
    for (const e of s.entries) {
      const head = e.headerBlockIds[0];
      if (head) entries.set(head, e.headerBlockIds.map((id) => byId.get(id)?.text ?? "").join(" · "));
    }
  }

  const line = (id: string) => `[${id}]${editable.has(id) ? "" : " (non modifiable)"} ${current(id)}`;
  const cv = structure.sections
    .flatMap((s) => s.entries.map((e) => `## ${s.heading}\n` + [...e.headerBlockIds, ...e.bulletBlockIds].map(line).join("\n")))
    .join("\n\n");
  const summary = structure.summaryBlockIds.map(line).join("\n");
  const answersText = input.answers.map((a) => describeAnswer(a, entries)).join("\n");

  let parsed: z.infer<typeof EnrichSchema>;
  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL_SMART,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(EnrichSchema) },
      system: [{ type: "text", text: SYSTEM.replace("{LANG}", input.locale === "fr" ? "français" : "English") }],
      messages: [
        {
          role: "user",
          content: `<poste_vise>${input.offerTitle}</poste_vise>\n\n<resume>\n${summary}\n</resume>\n\n<cv>\n${cv}\n</cv>\n\n<reponses_du_candidat>\n${answersText}\n</reponses_du_candidat>`,
        },
      ],
    });
    logUsage("enrichissement", response.model, response.usage);
    if (response.stop_reason === "refusal") throw new UserFacingError("ai_refused", 422);
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new UserFacingError("ai_failed", 502);
    parsed = response.parsed_output;
  } catch (error) {
    toUserError(error);
  }

  return checkEnrichment(parsed, input, byId, editable);
}
