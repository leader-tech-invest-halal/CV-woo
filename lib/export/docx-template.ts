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
  TabStopType,
  TextRun,
  WidthType,
  type IBorderOptions,
} from "docx";
import type { Block, ResumeStructure, ResumeStyle } from "@/lib/cv/types";
import { orderedSections, splitEntryHeader, stripBullet, textResolver } from "@/lib/cv/compose";
import { DENSITIES, type Density } from "@/lib/export/layout";

// Génère un .docx recomposé, avec le même modèle et le même réglage de mise en page que le PDF :
// « original » (le style du CV de la personne) ou un modèle CV Woo (Encre, Classique, Moderne,
// Minimaliste), chacun avec sa structure. (Un CV importé en Word avec « Votre design » est, lui,
// modifié directement dans son fichier : voir lib/cv/docx.ts.)

type Props = { blocks: Block[]; structure: ResumeStructure; style: ResumeStyle; accepted: Record<string, string> };
type Section = ResumeStructure["sections"][number];

const hex = (c: string) => c.replace("#", "").toUpperCase();
// Unités Word : tailles en demi-points, espacements et marges en vingtièmes de point
const half = (pt: number) => Math.round(pt * 2);
const tw = (pt: number) => Math.round(pt * 20);
// Interligne « simple » de Word ≈ 1,17 × la taille : on convertit l'interligne du PDF
const lineOf = (d: Density) => Math.round((240 * d.lineHeight) / 1.17);
const PAGE_WIDTH = 11906; // A4, en vingtièmes de point
const MUTED = "6B7280";

function isDark(color: string | null): boolean {
  if (!color) return false;
  const n = parseInt(color.replace("#", ""), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.45;
}

/** Même réglage de mise en page que le PDF (level), pour que les deux fichiers se ressemblent. */
export async function renderResumeDocx({ blocks, structure, style, accepted }: Props, level = 0): Promise<Uint8Array> {
  const d = DENSITIES[level] ?? DENSITIES[0];
  const t = textResolver(blocks, accepted);
  // Word utilise la police d'origine si elle est installée (Calibri, Montserrat…), sinon une police proche
  const font = style.bodyFont ?? (style.font === "serif" ? "Times New Roman" : "Arial");
  const headingFont = style.headingFont ?? font;
  const sidebar = style.layout !== "single";
  const sideDark = sidebar && isDark(style.sidebarColor);
  const align = style.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const design = style.design ?? "original";
  const designed = design !== "original";
  const fr = (structure.language ?? "fr").startsWith("fr");
  const label = { profile: fr ? "Profil" : "Profile", contact: "Contact" };

  // Largeur utile, pour aligner les dates à droite (taquet de tabulation)
  const margin = tw(sidebar ? d.margin / 2 : d.margin);
  const mainWidth = sidebar ? Math.round((PAGE_WIDTH - 2 * margin) * 0.68) - 500 : PAGE_WIDTH - 2 * margin;
  const sideWidth = Math.round((PAGE_WIDTH - 2 * margin) * 0.32) - 400;

  const headingText = (text: string) => {
    if (design === "minimaliste" && text === text.toUpperCase()) return text.charAt(0) + text.slice(1).toLowerCase();
    return style.headingCase === "upper" ? text.toUpperCase() : text;
  };

  // Titres de rubrique : chaque modèle a les siens (comme dans le PDF)
  const heading = (text: string, onSide = false) => {
    const white = onSide && sideDark;
    const color = white ? "FFFFFF" : hex(style.headingColor);
    let border: { bottom?: IBorderOptions; left?: IBorderOptions } | undefined;
    let size = d.heading;
    let spacing = 0; // espacement des lettres, en vingtièmes de point
    if (design === "encre") {
      border = { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1", space: 3 } };
      size = d.heading * 0.86;
      spacing = 28;
    } else if (design === "classique") {
      border = { bottom: { style: BorderStyle.SINGLE, size: 8, color: "111111", space: 2 } };
      spacing = 22;
    } else if (design === "moderne") {
      border = onSide
        ? { bottom: { style: BorderStyle.SINGLE, size: 4, color: white ? "FFFFFF" : hex(style.accentColor), space: 2 } }
        : { left: { style: BorderStyle.SINGLE, size: 18, color: hex(style.accentColor), space: 5 } };
      spacing = 18;
    } else if (design === "minimaliste") {
      size = d.heading + 0.5;
    } else if (style.headingRule) {
      border = { bottom: { style: BorderStyle.SINGLE, size: 6, color: white ? "FFFFFF" : hex(style.accentColor), space: 2 } };
    }
    return new Paragraph({
      spacing: { before: tw(d.headingBefore), after: tw(d.headingAfter + (design === "encre" ? 1 : 0)) },
      keepNext: true,
      border,
      children: [new TextRun({ text: headingText(text), bold: true, font: headingFont, size: half(size), color, characterSpacing: spacing || undefined })],
    });
  };

  const sideRun = (onSide: boolean) => (onSide && sideDark ? { color: "FFFFFF" } : {});

  const sectionParagraphs = (section: Section, onSide: boolean) => {
    const compact = onSide || section.kind === "skills" || section.kind === "languages";
    const width = onSide ? sideWidth : mainWidth;
    const out: Paragraph[] = [heading(section.headingBlockId ? t(section.headingBlockId) : section.heading, onSide)];
    section.entries.forEach((e, i) => {
      const items = e.bulletBlockIds.map((id) => stripBullet(t(id)));
      // Encre et Classique : compétences et langues courtes sur deux colonnes (taquet au milieu)
      if (
        (design === "encre" || design === "classique") &&
        !onSide &&
        compact &&
        e.headerBlockIds.length === 0 &&
        items.length >= 3 &&
        items.every((x) => x.length <= 45)
      ) {
        for (let k = 0; k < items.length; k += 2) {
          out.push(
            new Paragraph({
              spacing: { before: tw(k === 0 && i > 0 ? d.entryGap : d.bulletGap) },
              keepLines: true,
              tabStops: [{ type: TabStopType.LEFT, position: Math.round(width / 2) }],
              children: [new TextRun({ text: items[k] + (items[k + 1] ? `\t${items[k + 1]}` : ""), size: half(d.body) })],
            }),
          );
        }
        return;
      }

      // En-tête de l'expérience. Modèles CV Woo : « intitulé ……… dates », puis entreprise et lieu.
      if (designed && design !== "minimaliste" && !compact && e.headerBlockIds.length > 0) {
        const { title, date, meta } = splitEntryHeader(e.headerBlockIds.map((id) => t(id)));
        out.push(
          new Paragraph({
            spacing: { before: i > 0 ? tw(d.entryGap) : 0 },
            keepNext: true,
            keepLines: true,
            tabStops: [{ type: TabStopType.RIGHT, position: width }],
            children: [
              new TextRun({ text: title, bold: true, size: half(d.body) }),
              ...(date ? [new TextRun({ text: `\t${date}`, size: half(d.small), color: MUTED })] : []),
            ],
          }),
          ...meta.map(
            (m) => new Paragraph({ keepNext: true, keepLines: true, children: [new TextRun({ text: m, size: half(d.small), color: MUTED })] }),
          ),
        );
      } else {
        e.headerBlockIds.forEach((id, j) =>
          out.push(
            new Paragraph({
              spacing: { before: j === 0 && i > 0 ? tw(d.entryGap) : 0 },
              keepNext: true,
              keepLines: true,
              children: [new TextRun({ text: t(id), bold: j === 0, size: half(j === 0 ? d.body : d.small), ...sideRun(onSide) })],
            }),
          ),
        );
      }

      // Une expérience courte (jusqu'à 6 points) reste entière sur une même page ; une plus longue
      // peut continuer sur la page suivante, mais jamais au milieu d'un point.
      const keepWhole = e.headerBlockIds.length > 0 && e.bulletBlockIds.length <= 6;
      items.forEach((text, k) => {
        const asBullet = !compact && e.headerBlockIds.length > 0;
        out.push(
          new Paragraph({
            bullet: asBullet ? { level: 0 } : undefined,
            spacing: { before: tw(d.bulletGap) },
            keepNext: keepWhole && k < items.length - 1,
            keepLines: true,
            children: [new TextRun({ text, size: half(d.body), ...sideRun(onSide) })],
          }),
        );
      });
    });
    return out;
  };

  const contacts = structure.contactBlockIds.map(t).filter(Boolean);
  const header: Paragraph[] = [];
  if (structure.nameBlockId) {
    const name = [structure.nameBlockId, ...(structure.nameExtraBlockIds ?? [])].map(t).join(" ");
    header.push(
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: design === "classique" ? name.toUpperCase() : name,
            bold: true,
            font: headingFont,
            size: half(d.name + (design === "encre" ? 3 : design === "moderne" ? 4 : 0)),
            color: designed ? (design === "minimaliste" ? "000000" : design === "classique" ? "111111" : "111827") : hex(style.headingColor),
            characterSpacing: design === "classique" ? 44 : undefined,
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
    header.push(
      new Paragraph({
        alignment: align,
        border: design === "classique" ? { bottom: { style: BorderStyle.SINGLE, size: 8, color: "111111", space: 6 } } : undefined,
        children: [new TextRun({ text: contacts.join("  ·  "), size: half(d.small), color: designed && design !== "minimaliste" ? MUTED : undefined })],
      }),
    );
  }
  // Titre du résumé : celui du CV ; à défaut, les modèles CV Woo affichent « Profil »
  const summaryHeading = structure.summaryHeadingBlockId ? t(structure.summaryHeadingBlockId) : designed ? label.profile : null;
  if (summaryHeading && structure.summaryBlockIds.length) header.push(heading(summaryHeading));
  for (const id of structure.summaryBlockIds) {
    header.push(new Paragraph({ spacing: { before: tw(d.summaryGap) }, children: [new TextRun({ text: t(id), size: half(d.body) })] }));
  }

  const sections = orderedSections(structure, sidebar, design);
  const main = [...header, ...sections.main.flatMap((x) => sectionParagraphs(x, false))];

  let children: (Paragraph | Table)[] = main;
  if (sidebar) {
    const showContactHeading = (structure.contactHeadingBlockId || design === "moderne") && contacts.length > 0;
    const side = [
      ...(showContactHeading ? [heading(structure.contactHeadingBlockId ? t(structure.contactHeadingBlockId) : label.contact, true)] : []),
      ...contacts.map(
        (c) => new Paragraph({ spacing: { after: tw(2) }, children: [new TextRun({ text: c, size: half(d.small), ...sideRun(true) })] }),
      ),
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
            size: { width: PAGE_WIDTH, height: 16838 }, // A4
            margin: { top: tw(d.margin), bottom: tw(d.margin), left: margin, right: margin },
          },
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
