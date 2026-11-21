import "server-only";
import { orderedSections, stripBullet, textResolver } from "@/lib/cv/compose";
import { normalize } from "@/lib/ai/guardrails";
import type { Block, ResumeStructure, ResumeStyle } from "@/lib/cv/types";
import { DENSITIES, type LayoutMode } from "./layout";
import { columnGap, measureLayout, type LayoutMeasure } from "./measure";
import { renderResumePdf, type RenderedPdf } from "./pdf";

// Équilibrage automatique de la page, SANS IA (gratuit), à partir de la mesure du PDF réel :
//  1. colonne latérale trop courte (écart > 15 %) : on y déplace une rubrique courte de la colonne
//     principale ; colonne latérale trop longue : l'inverse ;
//  2. page qui déborde : la mise en page est d'abord resserrée (espaces, interligne, puis texte de
//     10 à 9,5 et 9 pt, jamais moins : voir renderResumePdf) ;
//  3. si elle déborde encore (mode Compact seulement) : on masque les puces les moins utiles pour
//     l'offre, en gardant au moins 2 puces par expérience. Les puces masquées sont signalées.
// 5 essais au plus (pas de boucle sans fin). Le PDF et le Word utilisent le résultat final.

type Doc = { blocks: Block[]; structure: ResumeStructure; style: ResumeStyle; accepted: Record<string, string> };
type Section = ResumeStructure["sections"][number];

export type BalanceReport = {
  /** Mesure du premier rendu, avant tout ajustement. */
  before: LayoutMeasure;
  /** Mesure du PDF final. */
  after: LayoutMeasure;
  /** Rubriques changées de colonne. */
  moved: { heading: string; to: "main" | "sidebar" }[];
  /** Puces masquées pour tenir sur une page (texte), de la moins utile à la plus utile. */
  hidden: string[];
  attempts: number;
};

/** Écart toléré entre les deux colonnes (en points de %). */
export const MAX_GAP = 15;
const MAX_ATTEMPTS = 5;
/** Rubriques courtes qu'on peut changer de colonne (jamais l'expérience ni la formation). */
const MOVABLE = new Set(["skills", "languages", "certifications", "interests", "qualities", "availability", "other"]);

/** Une rubrique peut changer de colonne si elle est courte par nature, ou si c’est une formation
 *  sans puces (diplômes sur une ou deux lignes, souvent placés dans la colonne latérale). */
const movable = (s: Section) =>
  MOVABLE.has(s.kind) || (s.kind === "education" && s.entries.length <= 3 && s.entries.every((e) => e.bulletBlockIds.length === 0));

const sectionText = (s: Section, t: (id: string) => string) =>
  [s.headingBlockId ? t(s.headingBlockId) : s.heading, ...s.entries.flatMap((e) => [...e.headerBlockIds, ...e.bulletBlockIds].map(t))].join("\n");

export async function renderBalanced(
  doc: Doc,
  mode: LayoutMode,
  keywords: string[] = [],
): Promise<{ pdf: RenderedPdf; doc: Doc; report: BalanceReport }> {
  const twoColumns = doc.style.layout !== "single";
  const design = doc.style.design ?? "original";
  const t = textResolver(doc.blocks, doc.accepted);
  const measure = (pdf: RenderedPdf) => measureLayout(pdf.bytes, doc.style.layout, DENSITIES[pdf.level].margin);

  let current = doc;
  let pdf = await renderResumePdf(current, mode);
  let m = await measure(pdf);
  const before = m;
  const moved: BalanceReport["moved"] = [];
  const hidden: string[] = [];
  const triedMoves = new Set<string>();
  let attempts = 0;

  // Change une rubrique de colonne (copie de la structure : le CV d'origine n'est pas touché)
  const withForced = (target: Section, to: "main" | "sidebar"): Doc => ({
    ...current,
    structure: {
      ...current.structure,
      sections: current.structure.sections.map((s) => (s === target ? { ...s, forced: to } : s)),
    },
  });

  while (attempts < MAX_ATTEMPTS) {
    let next: Doc | null = null;
    let move: BalanceReport["moved"][number] | null = null;
    let hide: string[] = [];

    if (twoColumns && m.side !== null && m.pages === 1 && columnGap(m) > MAX_GAP) {
      // Règle 1 : rééquilibrer les colonnes en déplaçant la rubrique courte la plus adaptée
      const { main, side } = orderedSections(current.structure, true, design);
      const from = m.side < m.main ? main : side;
      const to = m.side < m.main ? "sidebar" : "main";
      // Hauteur à transférer : environ la moitié de l'écart ; on choisit la rubrique dont la
      // longueur s'en approche le plus (les rubriques déjà essayées sont écartées)
      const candidates = from
        .filter((s) => movable(s) && !triedMoves.has(`${s.kind}:${s.heading}`))
        .map((s) => ({ s, size: sectionText(s, t).length }))
        .filter(({ size }) => size <= 600);
      const wanted = columnGap(m) * 12; // ≈ caractères pour la moitié de l'écart (ordre de grandeur)
      candidates.sort((a, b) => Math.abs(a.size - wanted) - Math.abs(b.size - wanted));
      const pick = candidates[0]?.s;
      if (pick) {
        triedMoves.add(`${pick.kind}:${pick.heading}`);
        next = withForced(pick, to);
        move = { heading: pick.headingBlockId ? t(pick.headingBlockId) : pick.heading, to };
      }
    } else if (twoColumns && m.side !== null && m.pages > 1 && m.side > m.main + MAX_GAP) {
      // La colonne latérale fait déborder la page : on renvoie une rubrique vers la principale
      const { side } = orderedSections(current.structure, true, design);
      const pick = side
        .filter((s) => movable(s) && !triedMoves.has(`${s.kind}:${s.heading}`))
        .sort((a, b) => sectionText(b, t).length - sectionText(a, t).length)[0];
      if (pick) {
        triedMoves.add(`${pick.kind}:${pick.heading}`);
        next = withForced(pick, "main");
        move = { heading: pick.headingBlockId ? t(pick.headingBlockId) : pick.heading, to: "main" };
      }
    }

    if (!next && m.pages > 1 && mode === "compact") {
      // Règle 3 : masquer les puces les moins utiles pour l'offre (au moins 2 par expérience)
      const plan = bulletsToHide(current, t, keywords, m);
      if (plan.length) {
        hide = plan;
        const drop = new Set(plan);
        next = {
          ...current,
          structure: {
            ...current.structure,
            sections: current.structure.sections.map((s) => ({
              ...s,
              entries: s.entries.map((e) => ({ ...e, bulletBlockIds: e.bulletBlockIds.filter((id) => !drop.has(id)) })),
            })),
          },
        };
      }
    }

    if (!next) break;
    attempts++;
    const nextPdf = await renderResumePdf(next, mode);
    const nextM = await measure(nextPdf);
    // Un changement qui n'améliore rien est annulé (on garde la version précédente)
    const better = nextM.pages < m.pages || (nextM.pages === m.pages && (hide.length > 0 ? nextM.overflow < m.overflow : columnGap(nextM) < columnGap(m)));
    // (masquer des puces sans gain ne sert à rien de plus : on s’arrête là)
    if (!better) {
      if (hide.length) break;
      continue;
    }
    current = next;
    pdf = nextPdf;
    m = nextM;
    if (move) moved.push(move);
    hidden.push(...hide.map((id) => stripBullet(t(id))));
  }

  return { pdf, doc: current, report: { before, after: m, moved, hidden, attempts } };
}

/**
 * Puces à masquer pour regagner la place qui dépasse : d'abord dans les expériences les moins
 * liées à l'offre (moins de mots-clés), en commençant par leurs dernières puces, jamais sous
 * 2 puces par expérience. Le nombre de lignes à regagner est estimé depuis la mesure.
 */
function bulletsToHide(doc: Doc, t: (id: string) => string, keywords: string[], m: { overflow: number }): string[] {
  const keys = keywords.map(normalize).filter((k) => k.length >= 3);
  const hits = (text: string) => keys.filter((k) => normalize(text).includes(k)).length;
  // Lignes à regagner : place qui dépasse (hauteur utile ≈ 770 pt, ligne ≈ 12 pt), plus une marge
  const linesNeeded = Math.ceil((m.overflow / 100) * (770 / 12)) + 1;
  const charsPerLine = doc.style.layout === "single" ? 95 : 62;

  const entries = doc.structure.sections
    .filter((s) => s.kind === "experience" || s.kind === "projects")
    .flatMap((s) => s.entries)
    .filter((e) => e.headerBlockIds.length > 0 && e.bulletBlockIds.length > 2)
    .map((e) => ({ e, relevance: e.bulletBlockIds.reduce((n, id) => n + hits(t(id)), 0) }))
    .sort((a, b) => a.relevance - b.relevance);

  const plan: string[] = [];
  let freed = 0;
  for (const { e } of entries) {
    // Puces de la moins utile à la plus utile ; à égalité, la plus basse d'abord
    const order = e.bulletBlockIds
      .map((id, i) => ({ id, i, score: hits(t(id)) }))
      .sort((a, b) => a.score - b.score || b.i - a.i);
    let left = e.bulletBlockIds.length;
    for (const { id } of order) {
      if (freed >= linesNeeded || left <= 2) break;
      plan.push(id);
      left--;
      freed += Math.max(1, Math.ceil(stripBullet(t(id)).length / charsPerLine));
    }
    if (freed >= linesNeeded) break;
  }
  return plan;
}
