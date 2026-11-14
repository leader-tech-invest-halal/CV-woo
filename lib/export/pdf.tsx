import "server-only";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import path from "node:path";
import type { Block, ResumeStructure, ResumeStyle } from "@/lib/cv/types";
import { FONTS, matchFont, type FontKey } from "@/lib/fonts";
import { pdfSafe, stripBullet, textResolver } from "@/lib/cv/compose";
import { DENSITIES, type Density, type LayoutMode } from "@/lib/export/layout";

// Génère le PDF du CV optimisé en reprenant le style du CV d'origine :
// couleurs, police (avec ou sans empattement), disposition en une ou deux colonnes,
// alignement de l'en-tête, casse et filets des titres. Le texte reste réel et sélectionnable.

// Pas de coupure automatique des mots (« con-tenus ») : un mot entier passe à la ligne suivante
Font.registerHyphenationCallback((word) => [word]);

// Polices reprises du CV d'origine (équivalents libres intégrés au PDF)
const registered = new Set<FontKey>();
const fontFile = (key: FontKey, weight: 400 | 700) =>
  path.join(process.cwd(), "node_modules", "@fontsource", key, "files", `${key}-latin-${weight}-normal.woff`);

function fontFamily(name: string | null, fallback: "sans" | "serif"): string {
  const key = matchFont(name);
  if (!key) return fallback === "serif" ? "Times-Roman" : "Helvetica";
  if (!registered.has(key)) {
    Font.register({
      family: FONTS[key].label,
      fonts: [
        { src: fontFile(key, 400), fontWeight: 400 },
        { src: fontFile(key, 700), fontWeight: 700 },
      ],
    });
    registered.add(key);
  }
  return FONTS[key].label;
}

type Props = { blocks: Block[]; structure: ResumeStructure; style: ResumeStyle; accepted: Record<string, string> };
type Section = ResumeStructure["sections"][number];
type Entry = Section["entries"][number];

const SIDE_WIDTH = "32%";

function CvDocument({ blocks, structure, style, accepted, d }: Props & { d: Density }) {
  const t = (id: string | null | undefined) => pdfSafe(textResolver(blocks, accepted)(id));
  const regular = fontFamily(style.bodyFont, style.font);
  const bold = fontFamily(style.headingFont ?? style.bodyFont, style.font);
  const sidebar = style.layout !== "single";
  const sidebarDark = style.sidebarColor ? luminance(style.sidebarColor) < 0.45 : false;
  const sideText = sidebarDark ? "#ffffff" : style.textColor;

  const s = StyleSheet.create({
    // Marges haute et basse sur la page : elles se répètent donc sur chaque page
    page: {
      fontFamily: regular,
      fontSize: d.body,
      color: style.textColor,
      lineHeight: d.lineHeight,
      flexDirection: "row",
      paddingTop: d.margin,
      paddingBottom: d.margin,
    },
    main: { flex: 1, paddingHorizontal: d.margin },
    side: { width: SIDE_WIDTH, paddingHorizontal: Math.max(16, d.margin * 0.6), color: sideText },
    // Fond de la colonne latérale, répété sur toutes les pages et jusqu'aux bords
    sideBackground: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: SIDE_WIDTH,
      backgroundColor: style.sidebarColor ?? undefined,
      ...(style.layout === "sidebar-right" ? { right: 0 } : { left: 0 }),
    },
    name: { fontFamily: bold, fontWeight: 700, fontSize: d.name, lineHeight: 1.15, color: style.headingColor, textAlign: style.headerAlign },
    headline: { fontSize: d.headline, lineHeight: 1.25, color: style.accentColor, marginTop: 3, textAlign: style.headerAlign },
    contacts: { fontSize: d.small, marginTop: 4, textAlign: style.headerAlign },
    heading: {
      fontFamily: bold,
      fontWeight: 700,
      fontSize: d.heading,
      lineHeight: 1.2,
      marginTop: d.headingBefore,
      marginBottom: d.headingAfter,
      paddingBottom: style.headingRule ? 2 : 0,
      textTransform: style.headingCase === "upper" ? "uppercase" : "none",
      letterSpacing: style.headingCase === "upper" ? 0.6 : 0,
      borderBottomWidth: style.headingRule ? 1 : 0,
      borderBottomColor: style.accentColor,
    },
    entryTitle: { fontFamily: regular, fontWeight: 700 },
    entryMeta: { fontSize: d.small, opacity: 0.8 },
    bullet: { flexDirection: "row", marginTop: d.bulletGap },
    dot: { width: 10 },
    bulletText: { flex: 1 },
  });

  const SectionView = ({ section, onSide }: { section: Section; onSide: boolean }) => {
    const compact = onSide || section.kind === "skills" || section.kind === "languages";

    const header = (e: Entry) =>
      e.headerBlockIds.map((id, j) => (
        <Text key={id} style={j === 0 && !compact ? s.entryTitle : j === 0 ? {} : s.entryMeta}>
          {t(id)}
        </Text>
      ));

    // Un point n'est jamais coupé entre deux pages
    const line = (e: Entry, id: string) => {
      const text = stripBullet(t(id));
      return compact || e.headerBlockIds.length === 0 ? (
        <Text key={id} style={{ marginTop: d.bulletGap }} wrap={false}>
          {text}
        </Text>
      ) : (
        <View key={id} style={s.bullet} wrap={false}>
          <Text style={s.dot}>•</Text>
          <Text style={s.bulletText}>{text}</Text>
        </View>
      );
    };

    // Une expérience peut se poursuivre sur la page suivante entre deux points,
    // mais son intitulé reste toujours avec son premier point.
    const entry = (e: Entry, i: number, withHeading: boolean) => {
      const [firstLine, ...otherLines] = e.bulletBlockIds;
      return (
        <View key={i} style={{ marginTop: i === 0 ? 0 : d.entryGap }}>
          <View wrap={false}>
            {withHeading && headingText}
            {header(e)}
            {firstLine && line(e, firstLine)}
          </View>
          {otherLines.map((id) => line(e, id))}
        </View>
      );
    };

    const headingText = (
      <Text
        style={[
          s.heading,
          { color: onSide && sidebarDark ? "#ffffff" : style.headingColor },
          onSide && sidebarDark ? { borderBottomColor: "#ffffff" } : {},
        ]}
      >
        {section.headingBlockId ? t(section.headingBlockId) : pdfSafe(section.heading)}
      </Text>
    );

    if (section.entries.length === 0) return <View wrap={false}>{headingText}</View>;
    // Le titre de la rubrique reste toujours sur la même page que le début du premier élément
    return <View>{section.entries.map((e, i) => entry(e, i, i === 0))}</View>;
  };

  const mainSections = structure.sections.filter((x) => !sidebar || x.placement === "main");
  const sideSections = structure.sections.filter((x) => sidebar && x.placement === "sidebar");
  const contacts = structure.contactBlockIds.map(t).filter(Boolean);
  const fullName = [structure.nameBlockId, ...(structure.nameExtraBlockIds ?? [])].map(t).join(" ");

  const header = (
    <View>
      {structure.nameBlockId && <Text style={s.name}>{fullName}</Text>}
      {structure.headlineBlockId && <Text style={s.headline}>{t(structure.headlineBlockId)}</Text>}
      {!sidebar && contacts.length > 0 && <Text style={s.contacts}>{contacts.join("  ·  ")}</Text>}
      {structure.summaryBlockIds.map((id) => (
        <Text key={id} style={{ marginTop: d.summaryGap }}>
          {t(id)}
        </Text>
      ))}
    </View>
  );

  const side = sidebar ? (
    <View style={s.side}>
      {structure.contactHeadingBlockId && contacts.length > 0 && (
        <Text
          style={[
            s.heading,
            { color: sidebarDark ? "#ffffff" : style.headingColor, marginTop: 0 },
            sidebarDark ? { borderBottomColor: "#ffffff" } : {},
          ]}
        >
          {t(structure.contactHeadingBlockId)}
        </Text>
      )}
      {contacts.map((c, i) => (
        <Text key={i} style={{ fontSize: d.small, marginBottom: 2 }}>
          {c}
        </Text>
      ))}
      {sideSections.map((x, i) => (
        <SectionView key={i} section={x} onSide />
      ))}
    </View>
  ) : null;

  return (
    <Document title={fullName || "CV"} creator="CV Woo" producer="CV Woo">
      <Page size="A4" style={s.page}>
        {sidebar && style.sidebarColor && <View fixed style={s.sideBackground} />}
        {style.layout === "sidebar-left" && side}
        <View style={s.main}>
          {header}
          {mainSections.map((x, i) => (
            <SectionView key={i} section={x} onSide={false} />
          ))}
        </View>
        {style.layout === "sidebar-right" && side}
      </Page>
    </Document>
  );
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export type RenderedPdf = { bytes: Uint8Array; pages: number; level: number };

async function renderAt(props: Props, level: number): Promise<RenderedPdf> {
  const bytes = new Uint8Array(await renderToBuffer(<CvDocument {...props} d={DENSITIES[level]} />));
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  return { bytes, pages, level };
}

/**
 * Mode « detailed » : mise en page aérée, sur autant de pages que nécessaire.
 * Mode « compact » : on resserre la mise en page, étape par étape, jusqu'à tenir sur une page.
 * Si le CV ne tient pas sur une page même au réglage le plus serré, on garde la version aérée :
 * mieux vaut deux pages lisibles qu'une page illisible.
 */
export async function renderResumePdf(props: Props, mode: LayoutMode = "compact"): Promise<RenderedPdf> {
  const airy = await renderAt(props, 0);
  if (mode === "detailed" || airy.pages <= 1) return airy;
  for (let level = 1; level < DENSITIES.length; level++) {
    const attempt = await renderAt(props, level);
    if (attempt.pages <= 1) return attempt;
  }
  return airy;
}
