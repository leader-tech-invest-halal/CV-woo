import "server-only";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import path from "node:path";
import type { Block, ResumeStructure, ResumeStyle } from "@/lib/cv/types";
import { FONTS, matchFont, type FontKey } from "@/lib/fonts";
import { pdfSafe, stripBullet, textResolver } from "@/lib/cv/compose";

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

function CvDocument({ blocks, structure, style, accepted }: Props) {
  const t = (id: string | null | undefined) => pdfSafe(textResolver(blocks, accepted)(id));
  const regular = fontFamily(style.bodyFont, style.font);
  const bold = fontFamily(style.headingFont ?? style.bodyFont, style.font);
  const sidebar = style.layout !== "single";
  const sidebarDark = style.sidebarColor ? luminance(style.sidebarColor) < 0.45 : false;
  const sideText = sidebarDark ? "#ffffff" : style.textColor;

  const s = StyleSheet.create({
    page: { fontFamily: regular, fontSize: 10, color: style.textColor, lineHeight: 1.4, flexDirection: "row" },
    main: { flex: 1, paddingVertical: 36, paddingHorizontal: 36 },
    side: {
      width: "32%",
      paddingVertical: 36,
      paddingHorizontal: 20,
      backgroundColor: style.sidebarColor ?? undefined,
      color: sideText,
    },
    name: { fontFamily: bold, fontWeight: 700, fontSize: 22, lineHeight: 1.2, color: style.headingColor, textAlign: style.headerAlign },
    headline: { fontSize: 12, lineHeight: 1.3, color: style.accentColor, marginTop: 4, textAlign: style.headerAlign },
    contacts: { fontSize: 9, marginTop: 6, textAlign: style.headerAlign },
    heading: {
      fontFamily: bold, fontWeight: 700,
      fontSize: 11.5,
      marginTop: 14,
      marginBottom: 6,
      paddingBottom: 2,
      textTransform: style.headingCase === "upper" ? "uppercase" : "none",
      letterSpacing: style.headingCase === "upper" ? 0.6 : 0,
      borderBottomWidth: style.headingRule ? 1 : 0,
      borderBottomColor: style.accentColor,
    },
    entry: { marginBottom: 6 },
    entryTitle: { fontFamily: regular, fontWeight: 700 },
    entryMeta: { fontSize: 9, opacity: 0.8 },
    bullet: { flexDirection: "row", marginTop: 1.5 },
    dot: { width: 10 },
    bulletText: { flex: 1 },
  });

  const Section = ({ section, onSide }: { section: ResumeStructure["sections"][number]; onSide: boolean }) => {
    const compact = onSide || section.kind === "skills" || section.kind === "languages";
    const entry = (e: ResumeStructure["sections"][number]["entries"][number], i: number) => (
      <View key={i} style={s.entry} wrap={false}>
        {e.headerBlockIds.map((id, j) => (
          <Text key={id} style={j === 0 && !compact ? s.entryTitle : j === 0 ? {} : s.entryMeta}>
            {t(id)}
          </Text>
        ))}
        {e.bulletBlockIds.map((id) => {
          const text = t(id);
          return compact || e.headerBlockIds.length === 0 ? (
            <Text key={id} style={{ marginTop: 1.5 }}>
              {stripBullet(text)}
            </Text>
          ) : (
            <View key={id} style={s.bullet}>
              <Text style={s.dot}>•</Text>
              <Text style={s.bulletText}>{stripBullet(text)}</Text>
            </View>
          );
        })}
      </View>
    );
    const [first, ...rest] = section.entries;
    return (
      <View wrap>
        {/* Le titre reste toujours sur la même page que le premier élément de la rubrique */}
        <View wrap={false}>
          <Text
            style={[
              s.heading,
              { color: onSide && sidebarDark ? "#ffffff" : style.headingColor },
              onSide && sidebarDark ? { borderBottomColor: "#ffffff" } : {},
            ]}
          >
            {section.headingBlockId ? t(section.headingBlockId) : pdfSafe(section.heading)}
          </Text>
          {first && entry(first, 0)}
        </View>
        {rest.map((e, i) => entry(e, i + 1))}
      </View>
    );
  };

  const mainSections = structure.sections.filter((x) => !sidebar || x.placement === "main");
  const sideSections = structure.sections.filter((x) => sidebar && x.placement === "sidebar");
  const contacts = structure.contactBlockIds.map(t).filter(Boolean);

  const header = (
    <View>
      {structure.nameBlockId && (
        <Text style={s.name}>{[structure.nameBlockId, ...(structure.nameExtraBlockIds ?? [])].map(t).join(" ")}</Text>
      )}
      {structure.headlineBlockId && <Text style={s.headline}>{t(structure.headlineBlockId)}</Text>}
      {!sidebar && contacts.length > 0 && <Text style={s.contacts}>{contacts.join("  ·  ")}</Text>}
      {structure.summaryBlockIds.map((id) => (
        <Text key={id} style={{ marginTop: 8 }}>
          {t(id)}
        </Text>
      ))}
    </View>
  );

  const side = sidebar ? (
    <View style={s.side} fixed={false}>
      {structure.contactHeadingBlockId && contacts.length > 0 && (
        <Text style={[s.heading, { color: sidebarDark ? "#ffffff" : style.headingColor, marginTop: 0 }, sidebarDark ? { borderBottomColor: "#ffffff" } : {}]}>
          {t(structure.contactHeadingBlockId)}
        </Text>
      )}
      {contacts.map((c, i) => (
        <Text key={i} style={{ fontSize: 9, marginBottom: 3 }}>
          {c}
        </Text>
      ))}
      {sideSections.map((x, i) => (
        <Section key={i} section={x} onSide />
      ))}
    </View>
  ) : null;

  return (
    <Document title={[structure.nameBlockId, ...(structure.nameExtraBlockIds ?? [])].map(t).join(" ") || "CV"} creator="CV Woo" producer="CV Woo">
      <Page size="A4" style={s.page}>
        {style.layout === "sidebar-left" && side}
        <View style={s.main}>
          {header}
          {mainSections.map((x, i) => (
            <Section key={i} section={x} onSide={false} />
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

export async function renderResumePdf(props: Props): Promise<Uint8Array> {
  return new Uint8Array(await renderToBuffer(<CvDocument {...props} />));
}
