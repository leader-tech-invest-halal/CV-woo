import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Document, Packer, Paragraph, TextRun } from "docx";

// Fichiers de CV fictifs, fabriqués à la volée pour les tests (aucune donnée réelle).

export type PdfLine = { text: string; x?: number; size?: number; gap?: number };

/** PDF d'une page : chaque ligne est posée sous la précédente (gap = interligne). */
export async function makePdf(lines: PdfLine[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let y = 800;
  for (const l of lines) {
    const size = l.size ?? 10;
    page.drawText(l.text, { x: l.x ?? 50, y, size, font, color: rgb(0, 0, 0) });
    y -= l.gap ?? size * 1.25;
  }
  return doc.save();
}

/** PDF sans texte (comme un CV scanné). */
export async function makeImagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  page.drawRectangle({ x: 50, y: 50, width: 400, height: 700, color: rgb(0.9, 0.9, 0.9) });
  return doc.save();
}

/** DOCX simple : un paragraphe par entrée ; « bold » pour les titres. */
export async function makeDocx(paragraphs: { text: string; bold?: boolean; color?: string }[]): Promise<Uint8Array> {
  const doc = new Document({
    sections: [
      {
        children: paragraphs.map(
          (p) => new Paragraph({ children: [new TextRun({ text: p.text, bold: p.bold, color: p.color, font: "Calibri" })] }),
        ),
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
