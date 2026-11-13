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
      const glue = line.text && !line.text.endsWith(" ") && !it.str.startsWith(" ") && it.x - lastRight > 1 ? " " : "";
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
  return lines;
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
