import "server-only";
import { getDocumentProxy } from "unpdf";
import type { Block } from "./types";
import { pdfFontNames } from "@/lib/fonts";
import { UserFacingError } from "./validate-file";

// Lecture d'un PDF en blocs.
// 1. Les morceaux de texte sont regroupés en lignes, dans l'ordre du flux du PDF
//    (qui suit généralement l'ordre de lecture, colonne par colonne).
// 2. Les lignes d'un même paragraphe ou d'une même puce, coupées par le retour à la ligne
//    automatique, sont recollées. Sinon un paragraphe de 8 lignes devient 8 blocs, et la
//    réécriture d'une seule ligne laisse les 7 autres en double.

export type PdfExtraction = { blocks: Block[]; formatHints: string; pages: number };

type Line = {
  page: number;
  x: number;
  right: number;
  y: number;
  size: number;
  font: string;
  text: string;
  /** Fragment placé à droite sur la même ligne qu'un autre texte (ex. une date alignée à droite). */
  aside?: boolean;
};

type Item = { str: string; x: number; y: number; width: number; fontSize: number; font: string; hasEOL: boolean };
type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>;

/** Morceaux de texte de chaque page, avec leur police (pour ne jamais recoller deux styles différents). */
async function readItems(pdf: Pdf): Promise<Item[][]> {
  const pages: Item[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const [a, b, , , e, f] = raw.transform as number[];
      items.push({ str: raw.str, x: e, y: f, width: raw.width, fontSize: Math.hypot(a, b), font: raw.fontName, hasEOL: raw.hasEOL });
    }
    pages.push(items);
  }
  return pages;
}

const BULLET = /^[•●▪■◦‣∙·\-–*]\s*/;

function readLines(items: Item[][]): Line[] {
  const lines: Line[] = [];
  for (let page = 0; page < items.length; page++) {
    let cur: Line | null = null;
    let lastRight = 0;
    const flush = () => {
      if (cur) {
        cur.text = cur.text.replace(/\s{2,}/g, " ").trim();
        if (cur.text) lines.push(cur);
      }
      cur = null;
    };
    for (const it of items[page]) {
      // Les espaces seuls (parfois très larges entre deux colonnes) masqueraient l'écart entre colonnes
      if (!it.str.trim()) {
        if (it.hasEOL) flush();
        continue;
      }
      const c: Line | null = cur;
      const newLine = c !== null && Math.abs(it.y - c.y) > Math.max(2, it.fontSize * 0.4);
      const otherColumn = c !== null && !newLine && it.x - lastRight > 40;
      const startX = c?.x ?? 0;
      if (newLine || otherColumn) flush();
      if (!cur) {
        cur = { page, x: it.x, right: it.x + it.width, y: it.y, size: it.fontSize, font: it.font, text: "" };
        if (otherColumn) cur.aside = it.x - startX > 150;
      }
      const line: Line = cur;
      // Écart entre deux morceaux = espace entre deux mots. Seuil proportionnel à la taille du texte :
      // un texte serré ou justifié peut avoir des espaces de moins d'un point (« Gestiondelarelation… »),
      // alors que deux morceaux d'un même mot se touchent (écart quasi nul).
      const gap = it.x - lastRight;
      const glue = line.text && !line.text.endsWith(" ") && !it.str.startsWith(" ") && gap > Math.max(0.3, it.fontSize * 0.05) ? " " : "";
      line.text += glue + it.str;
      line.size = Math.max(line.size, it.fontSize);
      line.right = Math.max(line.right, it.x + it.width);
      lastRight = it.x + it.width;
      if (it.hasEOL) flush();
    }
    flush();
  }
  // Un fragment « à côté » n'est un aparté que s'il est court (date, lieu) ; sinon c'est une autre colonne
  for (const l of lines) if (l.aside && l.text.length > 30) l.aside = false;
  return byColumns(lines);
}

/**
 * CV en deux colonnes : beaucoup de PDF (Canva, Word) écrivent les deux colonnes ligne par ligne,
 * en alternance. On remet les lignes dans l'ordre de lecture : ce qui est au-dessus des colonnes
 * (en-tête pleine largeur), puis la colonne de gauche, puis celle de droite.
 * On ne touche à rien si la page n'a pas deux colonnes nettes (ex. CV une colonne avec des dates
 * alignées à droite : les lignes de gauche y dépassent la séparation, ce n'est pas une colonne).
 */
function byColumns(lines: Line[]): Line[] {
  const out: Line[] = [];
  const pages = [...new Set(lines.map((l) => l.page))];
  for (const page of pages) {
    const pageLines = lines.filter((l) => l.page === page);
    const split = columnSplit(pageLines);
    if (split === null) {
      out.push(...pageLines);
      continue;
    }
    const left = pageLines.filter((l) => l.x < split && l.right <= split + 2);
    const right = pageLines.filter((l) => l.x >= split);
    const full = pageLines.filter((l) => !left.includes(l) && !right.includes(l));
    // L'alternance n'a lieu d'être corrigée que si les colonnes sont réellement mélangées
    let switches = 0;
    let previous: "l" | "r" | null = null;
    for (const l of pageLines) {
      const side = left.includes(l) ? "l" : right.includes(l) ? "r" : null;
      if (side && previous && side !== previous) switches++;
      if (side) previous = side;
    }
    if (switches < 4) {
      out.push(...pageLines);
      continue;
    }
    // Les lignes qui commencent au bord de la colonne de droite sont des lignes de cette colonne,
    // pas des apartés (dates alignées à droite) : elles peuvent former des paragraphes
    const rightEdge = Math.min(...right.map((l) => l.x));
    for (const l of right) if (Math.abs(l.x - rightEdge) < 6) l.aside = false;
    const top = Math.max(...left.map((l) => l.y), ...right.map((l) => l.y));
    out.push(...full.filter((l) => l.y > top), ...left, ...right, ...full.filter((l) => l.y <= top));
  }
  return out;
}

/** Position x qui sépare deux colonnes sur une page, ou null s'il n'y en a pas. */
function columnSplit(lines: Line[]): number | null {
  if (lines.length < 8) return null;
  const xs = [...new Set(lines.map((l) => Math.round(l.x)))].sort((a, b) => a - b);
  // Plus grand écart entre deux débuts de ligne
  let best: { gap: number; at: number } | null = null;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (!best || gap > best.gap) best = { gap, at: xs[i] };
  }
  if (!best || best.gap < 60) return null;
  const split = best.at - 5;
  const left = lines.filter((l) => l.x < split);
  const right = lines.filter((l) => l.x >= split);
  if (left.length < 3 || right.length < 3) return null;
  // Une vraie colonne contient du texte sur une certaine largeur ; des dates ou des lieux alignés
  // à droite (CV une colonne) forment une bande étroite, qui n'est pas une colonne.
  const width = (ls: Line[]) => Math.max(...ls.map((l) => l.right)) - Math.min(...ls.map((l) => l.x));
  if (width(right) < 120 || width(left) < 80) return null;
  // Colonne de gauche réelle : ses lignes s'arrêtent avant la colonne de droite
  const contained = left.filter((l) => l.right <= split + 2).length / left.length;
  if (contained < 0.8) return null;
  // Les deux colonnes occupent la même hauteur de page (sinon : simple retrait, pas des colonnes)
  const span = (ls: Line[]) => [Math.min(...ls.map((l) => l.y)), Math.max(...ls.map((l) => l.y))];
  const [l1, l2] = span(left);
  const [r1, r2] = span(right);
  const overlap = Math.min(l2, r2) - Math.max(l1, r1);
  return overlap > 0.3 * Math.min(l2 - l1, r2 - r1) ? split : null;
}

const isHeading = (t: string) => t.length <= 40 && t === t.toUpperCase() && /\p{Lu}/u.test(t);

const LINK_WORDS =
  /\s(avec|de|du|des|et|ou|à|au|aux|en|la|le|les|l'|d'|pour|par|sur|dans|chez|un|une|mon|ma|mes|son|sa|ses|of|the|and|or|with|for|to|in|at|a|an|on|by)$/i;

const CONTACT = /@|https?:\/\/|www\.|^\+?\d[\d\s.]{7,}$/;

/** Recolle les lignes coupées (retour à la ligne automatique, ou retour manuel au milieu d'une phrase). */
function mergeLines(lines: Line[]): { text: string; first: Line }[] {
  // Bord droit de chaque colonne : la ligne la plus longue qui commence au même endroit
  const columnRight = (l: Line) =>
    Math.max(...lines.filter((o) => o.page === l.page && Math.abs(o.x - l.x) < 30).map((o) => o.right));

  type Para = { text: string; first: Line; last: Line };
  const paragraphs: Para[] = [];
  // Paragraphe auquel une ligne peut se rattacher : on saute les apartés (date alignée à droite),
  // pour recoller « Légendes Urbaines … IA et » / [2026] / « rencontres » en un seul titre.
  let target: Para | null = null;

  for (const line of lines) {
    if (line.aside) {
      paragraphs.push({ text: line.text, first: line, last: line });
      continue;
    }
    const p = target;
    if (p) {
      const prev = p.last;
      const gap = prev.y - line.y; // y augmente vers le haut dans un PDF
      const sameStyle = prev.page === line.page && Math.abs(prev.size - line.size) < 0.6 && prev.font === line.font;
      const startsBullet = BULLET.test(line.text);
      const firstIsBullet = BULLET.test(p.first.text);
      const aligned =
        Math.abs(line.x - p.first.x) < 3 || (firstIsBullet && line.x > p.first.x && line.x - p.first.x < 25);
      const right = columnRight(prev);
      const width = right - p.first.x;
      // Ligne « pleine » : elle touche le bord de la colonne, ou le premier mot de la ligne suivante
      // n'y aurait pas tenu (largeur estimée à un demi-corps par caractère).
      const nextWord = line.text.split(/\s/)[0] ?? "";
      const prevIsFull =
        prev.right >= right - Math.max(width * 0.15, prev.size * 2.5) ||
        prev.right + (nextWord.length + 1) * prev.size * 0.5 > right;
      const startsLower = /^[\p{Ll}«»"'(]/u.test(line.text);
      const prevOpen = !/[.!?:;]$/.test(prev.text); // la phrase précédente n'est pas terminée
      // Une majuscule ne continue la phrase que si la ligne précédente finit par un mot de liaison
      // (« À l'aise avec » / « Canva… ») ou si c'est la fin de la phrase (« … Communication » / « Digitale. »).
      const linkEnd = LINK_WORDS.test(prev.text);
      const sentenceEnd = line.text.length < 30 && /[.!?]$/.test(line.text) && p.text.length > 60;
      const continues = startsLower || linkEnd || sentenceEnd || /[-,(]$/.test(prev.text);

      // Cas 1 : retour à la ligne automatique (ligne précédente pleine, ligne suivante juste en dessous).
      // Une majuscule après une phrase terminée = nouvel élément (puce sans symbole, compétence…).
      const wrapped =
        gap > 0 && gap < prev.size * 1.9 && prevIsFull && continues;
      // Cas 2 : retour manuel au milieu d'une phrase, parfois avec un espace (CV mal mis en forme) :
      // la phrase n'est pas finie et le paragraphe est long, ou la suite commence par une minuscule.
      const brokenSentence =
        gap > 0 && gap < prev.size * 3.2 && prevOpen && continues && p.text.length > 40;

      if (
        sameStyle &&
        aligned &&
        !startsBullet &&
        (wrapped || brokenSentence) &&
        !CONTACT.test(prev.text) &&
        !CONTACT.test(line.text) &&
        !isHeading(prev.text) &&
        !isHeading(line.text)
      ) {
        // Coupure de mot en fin de ligne (« con- / tenus ») : on recolle sans tiret
        p.text = /\p{Ll}-$/u.test(p.text) && /^\p{Ll}/u.test(line.text) ? p.text.slice(0, -1) + line.text : `${p.text} ${line.text}`;
        p.last = line;
        continue;
      }
    }
    const para = { text: line.text, first: line, last: line };
    paragraphs.push(para);
    target = para;
  }
  return paragraphs;
}

export async function extractPdf(bytes: Uint8Array): Promise<PdfExtraction> {
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new UserFacingError("unsupported_file");
  }
  if (pdf.numPages > 6) throw new UserFacingError("too_many_pages");

  const paragraphs = mergeLines(readLines(await readItems(pdf)));

  const blocks: Block[] = [];
  const annotated: string[] = [];
  paragraphs.forEach((p, n) => {
    const id = `l${n}`;
    blocks.push({ id, text: p.text });
    annotated.push(`[${id}] (p${p.first.page + 1}, ${Math.round(p.first.size)}pt, x=${Math.round(p.first.x)}) ${p.text}`);
  });

  const chars = blocks.reduce((s, b) => s + b.text.length, 0);
  // PDF scanné ou « imprimé en PDF » (image) : pas de texte exploitable, l'OCR est hors V1
  if (chars < 80) throw new UserFacingError("scanned_pdf");

  const fonts = await pdfFontNames(bytes);
  return {
    blocks,
    pages: pdf.numPages,
    formatHints: [
      `Polices du document : ${fonts.join(", ") || "inconnues"}`,
      "",
      "Blocs (id, page, taille de police, position x, texte) :",
      ...annotated,
    ].join("\n"),
  };
}
