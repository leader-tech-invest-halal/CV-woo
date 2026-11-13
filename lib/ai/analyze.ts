import "server-only";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getClient, logUsage, MODEL_SMART, toUserError } from "./client";
import { checkRewrite, normalize, verifyEvidence } from "./guardrails";
import { computeScore } from "@/lib/scoring";
import type { AnalysisResult, Block, ParsedResume, Rewrite, SkillMatch } from "@/lib/cv/types";
import { UserFacingError } from "@/lib/cv/validate-file";

// Étapes 2 à 5 du pipeline en un seul appel : analyse de l'offre, comparaison avec preuves,
// recommandations et réécriture des blocs. Le score et la vérification anti-invention
// sont ensuite faits par le code.

const AnalysisSchema = z.object({
  offer: z.object({
    title: z.string(),
    company: z.string().nullable(),
    required_skills: z.array(z.string()),
    nice_to_have_skills: z.array(z.string()),
    keywords: z.array(z.string()).describe("Mots-clés ATS importants de l'offre (outils, méthodes, domaines)"),
  }),
  matches: z.array(
    z.object({
      skill: z.string(),
      importance: z.enum(["required", "nice", "keyword"]),
      status: z.enum(["present", "weak", "missing"]),
      evidence_block_id: z.string().nullable(),
      evidence_quote: z.string().nullable().describe("Extrait exact, copié mot pour mot du bloc cité"),
      advice: z.string().nullable(),
    }),
  ),
  rewrites: z.array(
    z.object({
      block_id: z.string(),
      new_text: z.string(),
      reason: z.string(),
      keywords_used: z.array(z.string()),
    }),
  ),
  feedback: z.string().describe("Synthèse en 2 à 4 phrases pour le candidat"),
});

const SYSTEM = `Tu es un recruteur expérimenté et un expert des logiciels de tri de CV (ATS).
On te donne un CV découpé en blocs ([id] texte) et une offre d'emploi. Ton travail : rendre ce CV
aussi pertinent que possible pour CETTE offre, comme le ferait un bon conseiller carrière, sans jamais mentir.

1. Analyse l'offre : intitulé exact, entreprise, compétences obligatoires, souhaitées, mots-clés ATS
   (outils, réseaux, méthodes, tâches clés), en reprenant les termes exacts de l'offre.
2. Pour chaque compétence ou mot-clé, indique s'il est présent dans le CV ("present"), seulement suggéré
   sans être démontré ("weak") ou absent ("missing"). Pour "present" et "weak", cite le bloc qui le prouve
   (evidence_block_id) et copie mot pour mot l'extrait exact (evidence_quote).
3. Réécris les blocs modifiables, dans cet ordre de priorité :
   a. L'ACCROCHE (titre sous le nom) : reprends l'intitulé du poste visé quand le parcours le justifie
      (ex. « Chargé de communication digitale » → « Content & Community Manager – Stage »), en gardant
      le type de contrat recherché (stage, alternance…) s'il figure dans le CV ou l'offre.
   b. LE RÉSUMÉ / PROFIL : réécris-le pour cette offre (poste visé, tâches clés de l'offre que le candidat
      a réellement faites, outils demandés qu'il maîtrise). S'il nomme un autre poste visé, remplace-le par
      le poste de l'offre.
   c. LES PUCES D'EXPÉRIENCE : reformule avec des verbes d'action et le vocabulaire EXACT de l'offre chaque
      fois que le CV décrit la même réalité (ex. « animation des réseaux sociaux » → « animation de
      communautés », « montage vidéo » quand le CV cite CapCut ou DaVinci Resolve et des vidéos).
      Mets en avant en début de phrase ce qui correspond le plus à l'offre.
   d. LES LIGNES DE COMPÉTENCES : reformule seulement pour employer le terme de l'offre qui désigne
      la même compétence.
   Règles de forme : même langue que le CV ; longueur proche de l'original (entre -30 % et +40 %) pour
   préserver la mise en page ; une réécriture remplace UN seul bloc et n'y recopie jamais le contenu
   d'un autre bloc ; ne propose pas une réécriture qui ne change presque rien.

RÈGLE ABSOLUE, sans exception : n'invente rien. Interdiction d'ajouter une compétence, un outil, un réseau
social, un diplôme, une certification, un employeur, une date, un chiffre, un pourcentage, une durée, une taille
d'équipe ou un résultat qui n'apparaît pas dans le CV. Exemple : si le CV ne cite pas TikTok, n'écris pas TikTok.
Une compétence absente va dans "matches" avec le statut "missing" et un conseil, jamais dans le CV.
Le seul ajout permis est l'intitulé du poste visé dans l'accroche et le résumé (c'est un objectif, pas un fait).

Écris reason, advice et feedback en {LANG}, en phrases simples. Dans feedback, indique honnêtement les écarts
importants avec l'offre (niveau d'études, expérience demandée) et comment les compenser.`;

export const AnalyzeInput = z.object({
  locale: z.enum(["fr", "en"]),
  offerText: z.string().min(200).max(20_000),
  resume: z.object({
    blocks: z.array(z.object({ id: z.string().max(20), text: z.string().max(2000) })).min(1).max(800),
    structure: z.object({
      nameBlockId: z.string().nullable(),
      nameExtraBlockIds: z.array(z.string()).optional(),
      headlineBlockId: z.string().nullable(),
      contactBlockIds: z.array(z.string()),
      contactHeadingBlockId: z.string().nullable().optional(),
      lockedBlockIds: z.array(z.string()).optional(),
      summaryBlockIds: z.array(z.string()),
      sections: z.array(
        z.object({
          headingBlockId: z.string().nullable(),
          heading: z.string(),
          kind: z.string(),
          entries: z.array(z.object({ headerBlockIds: z.array(z.string()), bulletBlockIds: z.array(z.string()) })),
        }),
      ),
    }),
  }),
});

/** Blocs que l'IA a le droit de réécrire : résumé, accroche, puces et listes de compétences.
 *  Jamais le nom, les coordonnées, les titres de rubrique ni les en-têtes (poste, entreprise, dates). */
function rewritableIds(structure: z.infer<typeof AnalyzeInput>["resume"]["structure"]): Set<string> {
  const ids = new Set<string>(structure.summaryBlockIds);
  if (structure.headlineBlockId) ids.add(structure.headlineBlockId);
  for (const s of structure.sections) {
    if (s.kind === "languages") continue;
    for (const e of s.entries) for (const id of e.bulletBlockIds) ids.add(id);
  }
  for (const id of structure.lockedBlockIds ?? []) ids.delete(id);
  return ids;
}

export async function analyze(input: z.infer<typeof AnalyzeInput>): Promise<AnalysisResult> {
  const { blocks, structure } = input.resume;
  const byId = new Map<string, Block>(blocks.map((b) => [b.id, b]));
  const editable = rewritableIds(structure);
  const resumeText = blocks.map((b) => b.text).join("\n");

  const cv = blocks.map((b) => `[${b.id}]${editable.has(b.id) ? "" : " (non modifiable)"} ${b.text}`).join("\n");

  let parsed: z.infer<typeof AnalysisSchema>;
  try {
    const response = await getClient().beta.messages.parse({
      model: MODEL_SMART,
      max_tokens: 16000,
      // En cas de refus du modèle (faux positif des filtres de sécurité), l'API relance
      // automatiquement la requête sur un modèle de secours.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(AnalysisSchema) },
      system: [
        { type: "text", text: SYSTEM.replace("{LANG}", input.locale === "fr" ? "français" : "English"), cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `<cv>\n${cv}\n</cv>\n\n<offre>\n${input.offerText}\n</offre>`,
        },
      ],
    });
    logUsage("analyse", response.model, response.usage);
    if (response.stop_reason === "refusal") throw new UserFacingError("ai_refused", 422);
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new UserFacingError("ai_failed", 502);
    parsed = response.parsed_output;
  } catch (error) {
    toUserError(error);
  }

  // Comparaison : on vérifie chaque preuve et on supprime les doublons
  const seen = new Set<string>();
  const matches: SkillMatch[] = [];
  for (const m of parsed.matches) {
    const key = normalize(m.skill);
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(
      verifyEvidence(
        {
          skill: m.skill,
          importance: m.importance,
          status: m.status,
          evidenceBlockId: m.evidence_block_id,
          evidenceQuote: m.evidence_quote,
          advice: m.advice,
        },
        byId,
      ),
    );
  }

  const offerTitle = normalize(parsed.offer.title);
  const isTargetBlock = (id: string) => id === structure.headlineBlockId || structure.summaryBlockIds.includes(id);

  // Réécritures : uniquement sur des blocs autorisés, puis contrôle anti-invention
  const rewrites: Rewrite[] = [];
  const done = new Set<string>();
  for (const r of parsed.rewrites) {
    const block = byId.get(r.block_id);
    const after = r.new_text.replace(/\s+/g, " ").trim();
    if (!block || !editable.has(r.block_id) || done.has(r.block_id) || !after || after === block.text) continue;
    // Une réécriture beaucoup plus longue que l'original absorbe d'autres blocs (texte en double)
    // et casse la mise en page : on la refuse.
    if (after.length > block.text.length * 1.7 + 40) continue;
    done.add(r.block_id);
    rewrites.push({
      blockId: r.block_id,
      before: block.text,
      after,
      reason: r.reason,
      keywords: r.keywords_used,
      flags: checkRewrite(after, r.keywords_used, resumeText, matches).filter(
        // L'accroche et le résumé peuvent nommer le poste visé : ce n'est pas un fait inventé
        (f) => !(isTargetBlock(r.block_id) && f.startsWith("term:") && offerTitle.includes(normalize(f.slice(5)))),
      ),
    });
  }

  return {
    offer: { title: parsed.offer.title, company: parsed.offer.company },
    score: computeScore(matches),
    matches,
    rewrites,
    feedback: parsed.feedback,
  };
}
