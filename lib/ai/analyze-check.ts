import { checkSectionItems, duplicateOf, formatOnlyChange } from "./guardrails";
import { NEW_SECTION_IDS, type NewSectionKind } from "@/lib/cv/compose";
import type { Block, ResumeStructure, Rewrite } from "@/lib/cv/types";

// Contrôles du code sur les propositions de l'analyse qui ne sont pas des reformulations :
// doublons à supprimer, corrections de forme, rubriques ajoutées. Testables sans IA.

type Removal = { block_id: string; duplicate_of: string; reason: string };
type FormatFix = { block_id: string; new_text: string; reason: string };
type NewSection = {
  kind: NewSectionKind;
  items: { text: string; evidence_block_id: string | null; evidence_quote: string | null }[];
};

/**
 * Propositions supplémentaires, vérifiées :
 * - suppression d'un doublon : seulement une puce, une ligne de compétences ou une phrase du résumé
 *   dont le contenu figure vraiment déjà ailleurs dans le CV ;
 * - correction de forme (nom « Prénom NOM », coordonnées, intitulés, dates) : mêmes lettres et
 *   mêmes chiffres, seuls la casse, les accents, les espaces et la ponctuation changent ;
 * - rubriques « Disponibilités » et « Qualités » : chaque élément doit être prouvé par un extrait
 *   exact du CV, sinon il est marqué « à vérifier » (la proposition n'est alors pas cochée).
 * Un bloc déjà reformulé (done) n'est jamais repris.
 */
export function extraProposals(
  parsed: { removals: Removal[]; format_fixes: FormatFix[]; new_sections: NewSection[] },
  ctx: { blocks: Block[]; structure: ResumeStructure; done: Set<string>; fr: boolean; conditions: string[] },
): Rewrite[] {
  const byId = new Map(ctx.blocks.map((b) => [b.id, b]));
  const out: Rewrite[] = [];
  const done = new Set(ctx.done);

  // Doublons : parmi les puces, lignes de compétences et phrases du résumé
  const removable = new Set<string>([...ctx.structure.summaryBlockIds, ...ctx.structure.sections.flatMap((s) => s.entries.flatMap((e) => e.bulletBlockIds))]);
  const candidates = ctx.blocks.filter((b) => removable.has(b.id));
  for (const r of parsed.removals) {
    const block = byId.get(r.block_id);
    if (!block || !removable.has(r.block_id) || done.has(r.block_id)) continue;
    // On ne retire pas un bloc dont le « double » est lui-même retiré
    const twin = duplicateOf(r.block_id, candidates.filter((b) => !out.some((o) => o.blockId === b.id)));
    if (!twin) continue;
    done.add(r.block_id);
    out.push({
      blockId: r.block_id,
      before: block.text,
      after: "",
      reason: r.reason || (ctx.fr ? `Doublon de : « ${twin.text} »` : `Duplicate of: "${twin.text}"`),
      keywords: [],
      flags: [],
    });
  }

  // Corrections de forme
  for (const f of parsed.format_fixes) {
    const block = byId.get(f.block_id);
    const after = f.new_text.replace(/\s+/g, " ").trim();
    if (!block || done.has(f.block_id) || !formatOnlyChange(block.text, after)) continue;
    done.add(f.block_id);
    out.push({ blockId: f.block_id, before: block.text, after, reason: f.reason, keywords: [], flags: [] });
  }

  // Rubriques ajoutées (une seule de chaque sorte)
  const kinds = new Set<NewSectionKind>();
  for (const section of parsed.new_sections) {
    if (kinds.has(section.kind)) continue;
    const items = checkSectionItems(section.items, byId).slice(0, 6);
    // Éléments identiques (à la casse près) : un seul
    const unique = items.filter((x, i) => items.findIndex((y) => y.text.toLowerCase() === x.text.toLowerCase()) === i);
    if (!unique.length) continue;
    kinds.add(section.kind);
    const reason =
      section.kind === "availability"
        ? ctx.fr
          ? `L'offre impose ${ctx.conditions.length ? `ces conditions : ${ctx.conditions.slice(0, 3).join(", ")}` : "des conditions précises"}. Une rubrique dédiée les met en évidence, d'après votre CV.`
          : `The job has firm requirements${ctx.conditions.length ? ` (${ctx.conditions.slice(0, 3).join(", ")})` : ""}. A dedicated section highlights them, based on your resume.`
        : ctx.fr
          ? "L'offre demande ces qualités : chacune est reprise de votre CV, dans une rubrique que le recruteur lit d'un coup d'œil."
          : "The job asks for these qualities: each one comes from your resume, in a section the recruiter can scan at a glance.";
    out.push({
      blockId: NEW_SECTION_IDS[section.kind],
      before: "",
      after: unique.map((x) => x.text).join(" · "),
      reason,
      keywords: [],
      flags: unique.filter((x) => !x.proven).map((x) => `verify:${x.text}`),
    });
  }
  return out;
}
