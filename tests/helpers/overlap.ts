import { extractTextItems, getDocumentProxy } from "unpdf";

// Détecte les textes qui se chevauchent dans un PDF : deux morceaux de texte de la même page
// dont les rectangles se recouvrent nettement. Sert aux tests de génération.

export type Overlap = { page: number; a: string; b: string };

export async function findOverlaps(bytes: Uint8Array): Promise<Overlap[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { items } = await extractTextItems(pdf);
  const out: Overlap[] = [];
  items.forEach((page, p) => {
    const boxes = page
      .filter((it) => it.str.trim())
      .map((it) => ({ s: it.str, x1: it.x, x2: it.x + it.width, y1: it.y, y2: it.y + it.height * 0.8 }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (w > 3 && h > 2) out.push({ page: p + 1, a: a.s.slice(0, 40), b: b.s.slice(0, 40) });
      }
    }
  });
  return out;
}
