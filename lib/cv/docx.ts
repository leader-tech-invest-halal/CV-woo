import "server-only";
import JSZip from "jszip";
import { DOMParser, XMLSerializer, type Element as XElement, type Node as XNode } from "@xmldom/xmldom";
import type { Block } from "./types";
import { UserFacingError } from "./validate-file";

// Lecture et réécriture « sur place » d'un fichier Word.
// Les blocs sont les paragraphes (w:p) de word/document.xml, dans l'ordre du document,
// zones de texte comprises. Réécrire un bloc ne change que le texte du paragraphe :
// styles, couleurs, polices, tableaux et images restent ceux du fichier d'origine.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

type Para = { el: XElement; texts: XElement[]; extras: XElement[]; text: string };

function isElement(n: XNode): n is XElement {
  return n.nodeType === 1;
}

/** Paragraphes « visibles » : on ignore la copie de secours (mc:Fallback) des zones de texte. */
function insideFallback(el: XElement): boolean {
  for (let p = el.parentNode; p; p = p.parentNode) {
    if (isElement(p) && p.nodeName === "mc:Fallback") return true;
  }
  return false;
}

/** Texte propre à un paragraphe, sans celui des paragraphes imbriqués (zones de texte). */
function collect(p: XElement): Para {
  const texts: XElement[] = [];
  const extras: XElement[] = [];
  let text = "";
  const walk = (node: XNode) => {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (!isElement(c)) continue;
      const name = c.nodeName;
      if (name === "w:p" || name === "w:txbxContent" || name === "mc:Fallback") continue;
      if (name === "w:t") {
        texts.push(c);
        text += c.textContent ?? "";
      } else if (name === "w:tab" || name === "w:br" || name === "w:cr") {
        // w:tab existe aussi dans w:tabs (définition des taquets) : on ne garde que ceux des runs
        if (c.parentNode && (c.parentNode as XElement).nodeName === "w:r") {
          extras.push(c);
          text += name === "w:tab" ? "\t" : "\n";
        }
      } else {
        walk(c);
      }
    }
  };
  walk(p);
  return { el: p, texts, extras, text };
}

function paragraphs(doc: ReturnType<DOMParser["parseFromString"]>): Para[] {
  const all = doc.getElementsByTagNameNS(W, "p");
  const out: Para[] = [];
  for (let i = 0; i < all.length; i++) {
    const el = all.item(i)!;
    if (!insideFallback(el)) out.push(collect(el));
  }
  return out;
}

async function load(bytes: Uint8Array) {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new UserFacingError("unsupported_file");
  }
  const file = zip.file("word/document.xml");
  if (!file) throw new UserFacingError("unsupported_file");
  const xml = await file.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return { zip, doc };
}

const clean = (s: string) => s.replace(/[\t\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

export type DocxExtraction = { blocks: Block[]; formatHints: string };

export async function extractDocx(bytes: Uint8Array): Promise<DocxExtraction> {
  const { zip, doc } = await load(bytes);
  const paras = paragraphs(doc);

  const blocks: Block[] = [];
  const annotated: string[] = [];
  const colorUse = new Map<string, number>();
  const fontUse = new Map<string, number>();

  paras.forEach((p, i) => {
    const text = clean(p.text);
    if (!text) return;
    const id = `d${i}`;
    blocks.push({ id, text });

    // Indices de mise en forme pour aider l'IA à reconnaître titres, rubriques et couleurs
    const attrs = new Set<string>();
    for (const t of p.texts) {
      const rPr = (t.parentNode as XElement | null)?.getElementsByTagNameNS(W, "rPr").item(0);
      if (!rPr) continue;
      if (rPr.getElementsByTagNameNS(W, "b").length) attrs.add("gras");
      const sz = rPr.getElementsByTagNameNS(W, "sz").item(0)?.getAttribute("w:val");
      if (sz) attrs.add(`${Number(sz) / 2}pt`);
      const color = rPr.getElementsByTagNameNS(W, "color").item(0)?.getAttribute("w:val");
      if (color && color !== "auto") {
        attrs.add(`#${color}`);
        colorUse.set(color, (colorUse.get(color) ?? 0) + (t.textContent?.length ?? 0));
      }
      const font = rPr.getElementsByTagNameNS(W, "rFonts").item(0)?.getAttribute("w:ascii");
      if (font) fontUse.set(font, (fontUse.get(font) ?? 0) + (t.textContent?.length ?? 0));
    }
    const shd = p.el.getElementsByTagNameNS(W, "shd").item(0)?.getAttribute("w:fill");
    if (shd && shd !== "auto" && shd !== "FFFFFF") attrs.add(`fond #${shd}`);
    if (p.el.getElementsByTagNameNS(W, "numPr").length) attrs.add("puce");
    annotated.push(`[${id}] (${[...attrs].join(", ") || "normal"}) ${text}`);
  });

  if (blocks.length === 0) throw new UserFacingError("empty_resume");

  // Polices par défaut du document et du thème
  const theme = await zip.file("word/theme/theme1.xml")?.async("string");
  const themeFont = theme?.match(/<a:minorFont>\s*<a:latin typeface="([^"]+)"/)?.[1];
  const tables = doc.getElementsByTagNameNS(W, "tbl").length;
  const textBoxes = doc.getElementsByTagNameNS(W, "txbxContent").length;
  const cellFills = new Set<string>();
  const tcPrs = doc.getElementsByTagNameNS(W, "tcPr");
  for (let i = 0; i < tcPrs.length; i++) {
    const fill = tcPrs.item(i)!.getElementsByTagNameNS(W, "shd").item(0)?.getAttribute("w:fill");
    if (fill && fill !== "auto" && fill !== "FFFFFF") cellFills.add(`#${fill}`);
  }

  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} (${v} caractères)`);

  const formatHints = [
    `Polices utilisées : ${top(fontUse).join(", ") || "par défaut"}; police du thème : ${themeFont ?? "inconnue"}`,
    `Couleurs de texte : ${top(colorUse).map((c) => "#" + c).join(", ") || "noir uniquement"}`,
    `Tableaux : ${tables}; zones de texte : ${textBoxes}; fonds de cellules : ${[...cellFills].join(", ") || "aucun"}`,
    "",
    "Paragraphes (id, mise en forme, texte) :",
    ...annotated,
  ].join("\n");

  return { blocks, formatHints };
}

/** Applique les réécritures acceptées dans le fichier d'origine et renvoie le nouveau .docx. */
export async function rewriteDocx(bytes: Uint8Array, rewrites: Record<string, string>): Promise<Uint8Array> {
  const { zip, doc } = await load(bytes);
  const paras = paragraphs(doc);

  for (const [id, newText] of Object.entries(rewrites)) {
    const index = Number(id.slice(1));
    const p = paras[index];
    if (!id.startsWith("d") || !p || p.texts.length === 0) continue;
    // Le premier morceau de texte garde sa mise en forme et reçoit le nouveau texte
    const [first, ...rest] = p.texts;
    while (first.firstChild) first.removeChild(first.firstChild);
    first.appendChild(doc.createTextNode(newText));
    first.setAttribute("xml:space", "preserve");
    for (const t of rest) {
      while (t.firstChild) t.removeChild(t.firstChild);
    }
    for (const e of p.extras) e.parentNode?.removeChild(e);
  }

  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
