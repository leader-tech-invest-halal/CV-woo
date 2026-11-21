import { extractTextItems, getDocumentProxy } from "unpdf";
import type { ResumeStyle } from "@/lib/cv/types";

// Mesure de la mise en page RÉELLE du CV, dans le PDF généré (l'aperçu affiché est ce PDF) :
// hauteur remplie par chaque colonne de la première page, et nombre de pages.
// L'IA ne voit pas le rendu final : c'est ce code qui contrôle l'équilibre de la page.

/** Largeur de la colonne latérale, en part de la page (identique à la mise en page du PDF). */
export const SIDE_RATIO = 0.32;

export type LayoutMeasure = {
  /** Nombre de pages du PDF. */
  pages: number;
  /** Remplissage de la colonne latérale sur la page 1, en % de la hauteur utile (null : une seule colonne). */
  side: number | null;
  /** Remplissage de la colonne principale sur la page 1, en %. */
  main: number;
  /** Texte passé sur la page 2, en % de la hauteur utile d'une page (0 si tout tient sur une page). */
  overflow: number;
};

/**
 * Mesure un PDF de CV. margin : marge haute et basse de la page (réglage de mise en page utilisé),
 * pour calculer la hauteur utile (page moins les deux marges).
 */
export async function measureLayout(bytes: Uint8Array, layout: ResumeStyle["layout"], margin: number): Promise<LayoutMeasure> {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const first = await doc.getPage(1);
  const [, , width, height] = first.view;
  const usable = height - 2 * margin;
  const { items } = await extractTextItems(doc);

  // Hauteur remplie (en %) par un ensemble de lignes : du haut de la zone utile jusqu'au bas
  // de la ligne la plus basse (y est mesuré depuis le bas de la page, sur la ligne de base).
  const fill = (lines: { y: number; height: number }[]) => {
    if (!lines.length) return 0;
    const lowest = Math.min(...lines.map((l) => l.y - 0.25 * l.height));
    return Math.max(0, Math.min(100, Math.round(((height - margin - lowest) / usable) * 100)));
  };
  const visible = (page: (typeof items)[number] = []) => page.filter((i) => i.str.trim() && i.height > 0);

  const page1 = visible(items[0]);
  const sideEdge = width * SIDE_RATIO;
  const inSide = (x: number) => (layout === "sidebar-left" ? x < sideEdge : layout === "sidebar-right" ? x >= width - sideEdge : false);

  return {
    pages: doc.numPages,
    side: layout === "single" ? null : fill(page1.filter((i) => inSide(i.x))),
    main: fill(page1.filter((i) => !inSide(i.x))),
    overflow: doc.numPages > 1 ? fill(items.slice(1).flatMap((p) => visible(p))) + (doc.numPages - 2) * 100 : 0,
  };
}

/** Écart de remplissage entre les deux colonnes (en points de %), 0 pour une seule colonne. */
export const columnGap = (m: LayoutMeasure) => (m.side === null ? 0 : Math.abs(m.main - m.side));
