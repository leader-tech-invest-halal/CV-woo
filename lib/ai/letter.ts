import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getClient, logUsage, MODEL_SMART, toUserError } from "./client";
import { adaptedResumeText, buildLetter } from "./letter-check";
import { LETTER_PROMPT } from "@/prompts/lettre";
import type { CoverLetter } from "@/lib/cv/types";
import { UserFacingError } from "@/lib/cv/validate-file";

// Lettre de motivation : UN seul appel à l'IA par lettre (CV adapté + offre + réponses du
// candidat). Le prompt est dans prompts/lettre.ts (modifiable). L'en-tête et les vérifications
// sont faits par le code (lib/ai/letter-check.ts).

const text = (max: number) => z.string().trim().max(max);

export const LetterInput = z.object({
  locale: z.enum(["fr", "en"]),
  offerText: z.string().min(200).max(20_000),
  offer: z.object({
    title: text(300),
    company: text(200).nullable(),
    conditions: z.array(text(200)).max(10).default([]),
  }),
  resume: z.object({
    blocks: z.array(z.object({ id: z.string().max(40), text: z.string().max(2000) })).min(1).max(800),
    structure: z.any(),
    style: z.any().optional(),
  }),
  accepted: z.record(z.string().max(40), z.string().max(3000)).default({}),
  answers: z.object({ motivation: text(600).default(""), asset: text(300).default("") }).default({ motivation: "", asset: "" }),
});

// Format de réponse simple (une liste de chaînes, aucun champ « null ») : accepté par l'API
const LetterSchema = z.object({
  subject: z.string(),
  salutation: z.string(),
  paragraphs: z.array(z.string()).describe("Exactement 4 paragraphes : l'offre, les preuves, l'apport, la conclusion"),
  closing: z.string().describe("Formule de politesse"),
  city: z.string().describe("Ville du candidat si elle figure dans le CV, sinon chaîne vide"),
  points_to_verify: z.array(z.string()).describe("Affirmations que le candidat doit confirmer ou compléter"),
});

export async function generateLetter(input: z.infer<typeof LetterInput>): Promise<CoverLetter> {
  const resume = { blocks: input.resume.blocks, structure: input.resume.structure, style: input.resume.style };
  const cv = adaptedResumeText(resume, input.accepted);
  const answers = [
    `Pourquoi ce poste / cette entreprise : ${input.answers.motivation || "(pas de réponse : ne prête aucune motivation au candidat)"}`,
    `Atout pratique : ${input.answers.asset || "(pas de réponse)"}`,
  ].join("\n");

  let draft: z.infer<typeof LetterSchema>;
  try {
    const response = await getClient().beta.messages.parse(
      {
        model: MODEL_SMART,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(LetterSchema) },
        system: [{ type: "text", text: LETTER_PROMPT.replace("{LANG}", input.locale === "fr" ? "français" : "English") }],
        messages: [
          {
            role: "user",
            content: `<cv_adapte>\n${cv}\n</cv_adapte>\n\n<offre>\n${input.offerText}\n</offre>\n\n<reponses_du_candidat>\n${answers}\n</reponses_du_candidat>`,
          },
        ],
      },
      { timeout: 120_000, maxRetries: 1 },
    );
    logUsage("lettre", response.model, response.usage);
    if (response.stop_reason === "refusal") throw new UserFacingError("ai_refused", 422);
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new UserFacingError("ai_failed", 502);
    draft = response.parsed_output;
  } catch (error) {
    toUserError(error);
  }

  return buildLetter(draft, {
    resume,
    accepted: input.accepted,
    locale: input.locale,
    company: input.offer.company,
    // Faits que la lettre peut citer : CV adapté, réponses, intitulé, entreprise, conditions de l'offre
    sources: [cv, input.answers.motivation, input.answers.asset, input.offer.title, input.offer.company ?? "", ...input.offer.conditions].join("\n"),
  });
}
