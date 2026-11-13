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
import { stripBullet, textResolver } from "@/lib/cv/compose";

// Génère un .docx à partir d'un CV importé en PDF, avec le style du PDF d'origine.
// (Un CV importé en Word est, lui, modifié directement dans son fichier : voir lib/cv/docx.ts.)

type Props = { blocks: Block[]; structure: ResumeStructure; style: ResumeStyle; accepted: Record<string, string> };

const hex = (c: string) => c.replace("#", "").toUpperCase();

export async function renderResumeDocx({ blocks, structure, style, accepted }: Props): Promise<Uint8Array> {
  const t = textResolver(blocks, accepted);
  // Word utilise la police d'origine si elle est installée (Calibri, Montserrat…), sinon une police proche
  const font = style.bodyFont ?? (style.font === "serif" ? "Times New Roman" : "Arial");
  const headingFont = style.headingFont ?? font;
  const sidebar = style.layout !== "single";
  const align = style.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;

  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: 240, after: 100 },
      border: style.headingRule
        ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(style.accentColor), space: 2 } }
        : undefined,
      children: [
        new TextRun({
          text: style.headingCase === "upper" ? text.toUpperCase() : text,
          bold: true,
          font: headingFont,
          size: 23,
          color: hex(style.headingColor),
        }),
      ],
    });

  const sectionParagraphs = (section: ResumeStructure["sections"][number], compact: boolean) => {
    const out: Paragraph[] = [heading(section.headingBlockId ? t(section.headingBlockId) : section.heading)];
    for (const e of section.entries) {
      e.headerBlockIds.forEach((id, j) =>
        out.push(
          new Paragraph({
            spacing: { before: j === 0 ? 120 : 0 },
            children: [new TextRun({ text: t(id), bold: j === 0, size: j === 0 ? 21 : 18 })],
          }),
        ),
      );
      for (const id of e.bulletBlockIds) {
        const text = stripBullet(t(id));
        const asBullet = !compact && e.headerBlockIds.length > 0 && section.kind !== "skills" && section.kind !== "languages";
        out.push(
          new Paragraph({
            bullet: asBullet ? { level: 0 } : undefined,
            spacing: { after: 40 },
            children: [new TextRun({ text, size: 20 })],
          }),
        );
      }
    }
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
            size: 44,
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
        children: [new TextRun({ text: t(structure.headlineBlockId), size: 24, color: hex(style.accentColor) })],
      }),
    );
  }
  if (!sidebar && contacts.length) {
    header.push(new Paragraph({ alignment: align, children: [new TextRun({ text: contacts.join("  ·  "), size: 18 })] }));
  }
  for (const id of structure.summaryBlockIds) {
    header.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: t(id), size: 20 })] }));
  }

  const main = [
    ...header,
    ...structure.sections.filter((x) => !sidebar || x.placement === "main").flatMap((x) => sectionParagraphs(x, false)),
  ];

  let children: (Paragraph | Table)[] = main;
  if (sidebar) {
    const side = [
      ...(structure.contactHeadingBlockId && contacts.length ? [heading(t(structure.contactHeadingBlockId))] : []),
      ...contacts.map((c) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: c, size: 18 })] })),
      ...structure.sections.filter((x) => x.placement === "sidebar").flatMap((x) => sectionParagraphs(x, true)),
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
    styles: { default: { document: { run: { font, size: 20, color: hex(style.textColor) } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: sidebar ? 360 : 720, right: sidebar ? 360 : 720 } } },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
