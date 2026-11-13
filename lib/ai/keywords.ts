import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, logUsage, MODEL_FAST, toUserError } from "./client";
import type { OfferKeyword } from "@/lib/ats/checks";
import { UserFacingError } from "@/lib/cv/validate-file";

// Extraction des mots-clés d'une offre (modèle rapide et peu coûteux).
// La recherche de ces mots dans le CV est ensuite faite par le code, pas par l'IA.

const Schema = z.object({
  keywords: z.array(
    z.object({
      term: z.string().describe("Mot-clé tel qu'un recruteur ou un ATS le chercherait"),
      variants: z.array(z.string()).describe("Synonymes, sigles et formes courantes (ex. JS / JavaScript)"),
      importance: z.enum(["required", "nice"]),
    }),
  ),
});

export async function extractOfferKeywords(offerText: string): Promise<OfferKeyword[]> {
  try {
    const response = await getClient().messages.parse({
      model: MODEL_FAST,
      max_tokens: 4000,
      output_config: { effort: "low", format: zodOutputFormat(Schema) },
      system:
        "Tu extrais d'une offre d'emploi les 10 à 25 mots-clés qu'un logiciel de recrutement (ATS) chercherait dans un CV : " +
        "compétences techniques, outils, méthodes, diplômes, certifications, langues et compétences métier. " +
        "Pas de qualités vagues (« motivé », « dynamique »). Termes courts (1 à 4 mots), dans la langue de l'offre.",
      messages: [{ role: "user", content: `<offre>\n${offerText}\n</offre>` }],
    });
    logUsage("mots-clés", MODEL_FAST, response.usage);
    if (!response.parsed_output) throw new UserFacingError("ai_failed", 502);
    return response.parsed_output.keywords.slice(0, 30);
  } catch (error) {
    toUserError(error);
  }
}
