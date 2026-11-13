import "server-only";
import JSZip from "jszip";
import { extractTextItems, getDocumentProxy } from "unpdf";
import { extractDocx } from "@/lib/cv/docx";
import { extractPdf } from "@/lib/cv/pdf";
import type { Block, SourceFormat } from "@/lib/cv/types";

// Inspection technique d'un CV, sans IA : ce qu'un logiciel de recrutement (ATS) peut lire,
// et les éléments de mise en page qui le gênent.

export type Inspection = {
  format: SourceFormat;
  fileName: string;
  sizeBytes: number;
  pages: number | null;
  blocks: Block[];
  /** Le texte tel qu'un ATS le lit, dans l'ordre de lecture. */
  plainText: string;
  layout: {
    columns: boolean; // plusieurs colonnes (PDF) ou colonnes de section (Word)
    tables: number;
    textBoxes: number;
    images: number;
    headerFooterText: string; // texte placé dans l'en-tête ou le pied de page (Word)
  };
};

async function inspectDocx(bytes: Uint8Array) {
  const { blocks } = await extractDocx(bytes);
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const count = (re: RegExp) => (xml.match(re) ?? []).length;

  let headerFooterText = "";
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    const part = await zip.file(name)!.async("string");
    headerFooterText += " " + [...part.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(" ");
  }
  const appXml = (await zip.file("docProps/app.xml")?.async("string")) ?? "";
  const pages = Number(appXml.match(/<Pages>(\d+)<\/Pages>/)?.[1]) || null;

  return {
    blocks,
    pages,
    layout: {
      columns: /<w:cols[^>]*w:num="([2-9])"/.test(xml),
      tables: count(/<w:tbl>/g),
      // Les zones de texte existent en version moderne (wps) et en version de secours (VML)
      textBoxes: count(/<wps:txbx>/g) || count(/<v:textbox/g),
      images: count(/<w:drawing>/g) + count(/<v:imagedata/g),
      headerFooterText: headerFooterText.replace(/\s+/g, " ").trim(),
    },
  };
}

async function inspectPdf(bytes: Uint8Array) {
  const { blocks, pages } = await extractPdf(bytes);
  // Détection de colonnes : beaucoup de lignes contiennent un grand espace horizontal,
  // signe que deux blocs de texte sont côte à côte.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { items } = await extractTextItems(pdf);
  let lines = 0;
  let splitLines = 0;
  for (const page of items) {
    const rows = new Map<number, { x: number; right: number }[]>();
    for (const it of page) {
      if (!it.str.trim()) continue;
      const key = Math.round(it.y / 3);
      const row = rows.get(key) ?? [];
      row.push({ x: it.x, right: it.x + it.width });
      rows.set(key, row);
    }
    for (const row of rows.values()) {
      lines++;
      row.sort((a, b) => a.x - b.x);
      if (row.some((r, i) => i > 0 && r.x - row[i - 1].right > 60)) splitLines++;
    }
  }
  return {
    blocks,
    pages,
    layout: {
      columns: lines > 10 && splitLines / lines > 0.2,
      tables: 0,
      textBoxes: 0,
      images: 0,
      headerFooterText: "",
    },
  };
}

export async function inspectResume(bytes: Uint8Array, format: SourceFormat, fileName: string): Promise<Inspection> {
  const r = format === "pdf" ? await inspectPdf(bytes) : await inspectDocx(bytes);
  return {
    format,
    fileName,
    sizeBytes: bytes.length,
    pages: r.pages,
    blocks: r.blocks,
    plainText: r.blocks.map((b) => b.text).join("\n"),
    layout: r.layout,
  };
}
