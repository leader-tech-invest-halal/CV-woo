import "server-only";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Block, ResumeStructure, ResumeStyle } from "@/lib/cv/types";
import { orderedSections, stripBullet, textResolver } from "@/lib/cv/compose";
import { DENSITIES, type Density } from "@/lib/export/layout";

// Génère un .docx à partir d'un CV importé en PDF, avec le style du PDF d'origine.
// (Un CV importé en Word est, lui, modifié directement dans son fichier : voir lib/cv/docx.ts.)

type Props = { blocks: Block[]; structure: ResumeStructure; style: ResumeStyle; accepted: Record<string, string> };

const hex = (c: string) => c.replace("#", "").toUpperCase();
// Unités Word : tailles en demi-points, espacements et marges en vingtièmes de point
const half = (pt: number) => Math.round(pt * 2);
const tw = (pt: number) => Math.round(pt * 20);
// Interligne « simple » de Word ≈ 1,17 × la taille : on convertit l'interligne du PDF
const lineOf = (d: Density) => Math.round((240 * d.lineHeight) / 1.17);

/** Même réglage de mise en page que le PDF (level), pour que les deux fichiers se ressemblent. */
export async function renderResumeDocx(
  { blocks, structure, style, accepted }: Props,
  level = 0,
): Promise<Uint8Array> {
  const d = DENSITIES[level] ?? DENSITIES[0];
  const t = textResolver(blocks, accepted);
  // Word utilise la police d'origine si elle est installée (Calibri, Montserrat…), sinon une police proche
  const font = style.bodyFont ?? (style.font === "serif" ? "Times New Roman" : "Arial");
  const headingFont = style.headingFont ?? font;
  const sidebar = style.layout !== "single";
  const align = style.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: tw(d.headingBefore), after: tw(d.headingAfter) },
      keepNext: true,
      border: style.headingRule
        ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(style.accentColor), space: 2 } }
        : undefined,
      children: [
        new TextRun({
          text: style.headingCase === "upper" ? text.toUpperCase() : text,
          bold: true,
          font: headingFont,
          size: half(d.heading),
          color: hex(style.headingColor),
        }),
      ],
    });

  const sectionParagraphs = (section: ResumeStructure["sections"][number], compact: boolean) => {
    const out: Paragraph[] = [heading(section.headingBlockId ? t(section.headingBlockId) : section.heading)];
    section.entries.forEach((e, i) => {
      // L'intitulé reste avec son premier point ; un point n'est jamais coupé entre deux pages
      e.headerBlockIds.forEach((id, j) =>
        out.push(
          new Paragraph({
            spacing: { before: j === 0 && i > 0 ? tw(d.entryGap) : 0 },
            keepNext: true,
            keepLines: true,
            children: [new TextRun({ text: t(id), bold: j === 0, size: half(j === 0 ? d.body : d.small) })],
          }),
        ),
      );
      // Une expérience courte (jusqu'à 6 points) reste entière sur une même page ; une plus longue
      // peut continuer sur la page suivante, mais jamais au milieu d'un point.
      const keepWhole = e.headerBlockIds.length > 0 && e.bulletBlockIds.length <= 6;
      e.bulletBlockIds.forEach((id, k) => {
        const text = stripBullet(t(id));
        const asBullet = !compact && e.headerBlockIds.length > 0 && section.kind !== "skills" && section.kind !== "languages";
        out.push(
          new Paragraph({
            bullet: asBullet ? { level: 0 } : undefined,
            spacing: { before: tw(d.bulletGap) },
            keepNext: keepWhole && k < e.bulletBlockIds.length - 1,
            keepLines: true,
            children: [new TextRun({ text, size: half(d.body) })],
          }),
        );
      });
    });
    return out;
  };

  const contacts = structure.contactBlockIds.map(t).filter(Boolean);
  const header: Paragraph[] = [];
  if (structure.nameBlockId) {
    header.push(
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: [structure.nameBlockId, ...(structure.nameExtraBlockIds ?? [])].map(t).join(" "),
            bold: true,
            font: headingFont,
            size: half(d.name),
            color: hex(style.headingColor),
          }),
        ],
      }),
    );
  }
  if (structure.headlineBlockId) {
    header.push(
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text: t(structure.headlineBlockId), size: half(d.headline), color: hex(style.accentColor) })],
      }),
    );
  }
  if (!sidebar && contacts.length) {
    header.push(new Paragraph({ alignment: align, children: [new TextRun({ text: contacts.join("  ·  "), size: half(d.small) })] }));
  }
  if (structure.summaryHeadingBlockId && structure.summaryBlockIds.length) {
    header.push(heading(t(structure.summaryHeadingBlockId)));
  }
  for (const id of structure.summaryBlockIds) {
    header.push(new Paragraph({ spacing: { before: tw(d.summaryGap) }, children: [new TextRun({ text: t(id), size: half(d.body) })] }));
  }

  const sections = orderedSections(structure, sidebar);
  const main = [...header, ...sections.main.flatMap((x) => sectionParagraphs(x, false))];

  let children: (Paragraph | Table)[] = main;
  if (sidebar) {
    const side = [
      ...(structure.contactHeadingBlockId && contacts.length ? [heading(t(structure.contactHeadingBlockId))] : []),
      ...contacts.map((c) => new Paragraph({ spacing: { after: tw(2) }, children: [new TextRun({ text: c, size: half(d.small) })] })),
      ...sections.side.flatMap((x) => sectionParagraphs(x, true)),
    ];
    const sideCell = new TableCell({
      width: { size: 32, type: WidthType.PERCENTAGE },
      shading: style.sidebarColor ? { type: ShadingType.CLEAR, color: "auto", fill: hex(style.sidebarColor) } : undefined,
      margins: { top: 200, bottom: 200, left: 200, right: 200 },
      children: side.length ? side : [new Paragraph("")],
    });
    const mainCell = new TableCell({
      width: { size: 68, type: WidthType.PERCENTAGE },
      margins: { top: 200, bottom: 200, left: 300, right: 200 },
      children: main,
    });
    const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    children = [
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
        rows: [new TableRow({ children: style.layout === "sidebar-left" ? [sideCell, mainCell] : [mainCell, sideCell] })],
      }),
    ];
  }

  const doc = new Document({
    creator: "CV Woo",
    title: t(structure.nameBlockId) || "CV",
    styles: {
      default: {
        document: {
          run: { font, size: half(d.body), color: hex(style.textColor) },
          paragraph: { spacing: { line: lineOf(d), before: 0, after: 0 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4
            margin: { top: tw(d.margin), bottom: tw(d.margin), left: tw(sidebar ? d.margin / 2 : d.margin), right: tw(sidebar ? d.margin / 2 : d.margin) },
          },
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
