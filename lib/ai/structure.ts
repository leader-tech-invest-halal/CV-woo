import "server-only";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { getClient, logUsage, MODEL_FAST, toUserError } from "./client";
import { DEFAULT_STYLE, type Block, type ResumeStructure, type ResumeStyle, type SourceFormat } from "@/lib/cv/types";
import { UserFacingError } from "@/lib/cv/validate-file";

// Étape 1 du pipeline : organiser les blocs du CV en rubriques et décrire son style visuel.
// L'IA ne renvoie que des identifiants de blocs : elle ne peut pas modifier le texte ici.

const Kind = z.enum(["experience", "education", "skills", "languages", "projects", "certifications", "interests", "other"]);

const StructureSchema = z.object({
  language: z.string().describe("Langue du CV, code ISO 639-1 (fr, en, ...)"),
  name_block_id: z.string().nullable(),
  name_extra_block_ids: z.array(z.string()).describe("Suite du nom s'il est écrit sur plusieurs blocs (ex. prénom puis NOM de famille)"),
  headline_block_id: z.string().nullable().describe("Titre du poste ou accroche sous le nom"),
  contact_block_ids: z.array(z.string()),
  contact_heading_block_id: z.string().nullable().describe("Titre de la zone de coordonnées (Contact, Coordonnées...), null s'il n'y en a pas"),
  summary_block_ids: z.array(z.string()).describe("Profil / résumé en haut du CV"),
  sections: z.array(
    z.object({
      heading_block_id: z.string().nullable(),
      heading: z.string().describe("Titre de la rubrique tel qu'écrit dans le CV"),
      kind: Kind,
      placement: z.enum(["main", "sidebar"]),
      entries: z.array(
        z.object({
          header_block_ids: z.array(z.string()).describe("Lignes d'en-tête : poste, entreprise, dates, lieu, diplôme..."),
          bullet_block_ids: z.array(z.string()).describe("Lignes de description, puces, compétences"),
        }),
      ),
    }),
  ),
  style: z.object({
    accent_color: z.string().describe("Couleur d'accent principale, format #rrggbb"),
    text_color: z.string().describe("#rrggbb"),
    heading_color: z.string().describe("Couleur des titres de rubrique, #rrggbb"),
    sidebar_color: z.string().nullable().describe("Fond de la colonne latérale #rrggbb, null si aucune"),
    font: z.enum(["sans", "serif"]),
    body_font: z.string().nullable().describe("Police du texte courant, nom exact tiré de la liste des polices fournie (null si inconnue)"),
    heading_font: z.string().nullable().describe("Police du nom et des titres, nom exact tiré de la liste des polices fournie (null si inconnue)"),
    layout: z.enum(["single", "sidebar-left", "sidebar-right"]),
    header_align: z.enum(["left", "center"]),
    heading_case: z.enum(["upper", "normal"]),
    heading_rule: z.boolean().describe("Un filet (trait) sépare-t-il les titres de rubrique ?"),
  }),
});

const SYSTEM = `Tu analyses la structure d'un CV déjà découpé en blocs identifiés ([id] texte).
Ta tâche : ranger chaque bloc dans la bonne partie du CV et décrire son style visuel.
Règles :
- Utilise uniquement des identifiants présents dans la liste. N'invente aucun identifiant ni aucun texte.
- Chaque bloc doit apparaître une seule fois (nom, accroche, contacts, titre des contacts, résumé ou une rubrique).
- Le résumé (summary) ne contient que des phrases de présentation, jamais un titre.
- Conserve l'ordre du CV d'origine, pour les rubriques comme pour les blocs.
- placement "sidebar" : la rubrique est dans une colonne latérale étroite ; sinon "main".
- Pour le style, décris fidèlement le CV d'origine (couleurs réelles, police avec ou sans empattement, disposition en colonnes).`;

const HEX = /^#[0-9a-f]{6}$/i;

function toStyle(s: z.infer<typeof StructureSchema>["style"]): ResumeStyle {
  const hex = (v: string | null, fallback: string) => (v && HEX.test(v) ? v : fallback);
  return {
    accentColor: hex(s.accent_color, DEFAULT_STYLE.accentColor),
    textColor: hex(s.text_color, DEFAULT_STYLE.textColor),
    headingColor: hex(s.heading_color, DEFAULT_STYLE.headingColor),
    sidebarColor: s.sidebar_color && HEX.test(s.sidebar_color) ? s.sidebar_color : null,
    font: s.font,
    bodyFont: s.body_font?.slice(0, 60) ?? null,
    headingFont: s.heading_font?.slice(0, 60) ?? null,
    layout: s.layout,
    headerAlign: s.header_align,
    headingCase: s.heading_case,
    headingRule: s.heading_rule,
  };
}

export async function structureResume(input: {
  format: SourceFormat;
  blocks: Block[];
  formatHints: string;
  pdfBase64?: string;
}): Promise<{ structure: ResumeStructure; style: ResumeStyle }> {
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.pdfBase64) {
    // Le PDF est joint pour que le modèle voie la mise en page réelle (couleurs, colonnes)
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.pdfBase64 } });
  }
  content.push({
    type: "text",
    text: `Format d'origine : ${input.format.toUpperCase()}.\n\n${input.formatHints}`,
  });

  let parsed: z.infer<typeof StructureSchema>;
  try {
    const response = await getClient().messages.parse({
      model: MODEL_FAST,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(StructureSchema) },
    });
    logUsage("structure", MODEL_FAST, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) throw new UserFacingError("ai_failed", 502);
    parsed = response.parsed_output;
  } catch (error) {
    toUserError(error);
  }

  // On ne garde que des identifiants qui existent vraiment
  const known = new Set(input.blocks.map((b) => b.id));
  const ids = (list: string[]) => list.filter((id) => known.has(id));
  const one = (id: string | null) => (id && known.has(id) ? id : null);

  const structure: ResumeStructure = {
    language: parsed.language,
    nameBlockId: one(parsed.name_block_id),
    nameExtraBlockIds: ids(parsed.name_extra_block_ids),
    headlineBlockId: one(parsed.headline_block_id),
    contactBlockIds: ids(parsed.contact_block_ids),
    contactHeadingBlockId: one(parsed.contact_heading_block_id),
    summaryBlockIds: ids(parsed.summary_block_ids),
    sections: parsed.sections.map((s) => ({
      headingBlockId: one(s.heading_block_id),
      heading: s.heading,
      kind: s.kind,
      placement: s.placement,
      entries: s.entries.map((e) => ({ headerBlockIds: ids(e.header_block_ids), bulletBlockIds: ids(e.bullet_block_ids) })),
    })),
  };

  return { structure, style: toStyle(parsed.style) };
}
