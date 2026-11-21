import "server-only";
import React from "react";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import type { Style } from "@react-pdf/types";
import path from "node:path";
import type { Block, ResumeStructure, ResumeStyle } from "@/lib/cv/types";
import { FONTS, matchFont, type FontKey } from "@/lib/fonts";
import { LABEL_KINDS, labelLine, orderedSections, pdfSafe, precisDensity, splitEntryHeader, splitLabel, stripBullet, textResolver } from "@/lib/cv/compose";
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

export function fontFamily(name: string | null, fallback: "sans" | "serif"): string {
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

function CvDocument({ blocks, structure, style, accepted, d: density }: Props & { d: Density }) {
  // Précis : lignes rapprochées, comme le modèle de référence
  const d = style.design === "precis" ? precisDensity(density) : density;
  const t = (id: string | null | undefined) => pdfSafe(textResolver(blocks, accepted)(id));
  const regular = fontFamily(style.bodyFont, style.font);
  const bold = fontFamily(style.headingFont ?? style.bodyFont, style.font);
  const sidebar = style.layout !== "single";
  const sidebarDark = style.sidebarColor ? luminance(style.sidebarColor) < 0.45 : false;
  const sideText = sidebarDark ? "#ffffff" : style.textColor;
  // Modèle choisi : « original » reprend le CV de la personne ; les autres ont leur propre structure
  const design = style.design ?? "original";
  const designed = design !== "original";
  const muted = "#6b7280";
  const fr = (structure.language ?? "fr").startsWith("fr");

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
    // Ligne « intitulé ……… dates » des modèles CV Woo
    titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    titleText: { flex: 1, fontFamily: bold, fontWeight: 700, paddingRight: 8 },
    date: { fontSize: d.small, color: muted, textAlign: "right" },
    meta: { fontSize: d.small, color: muted },
    // Compétences et langues sur deux colonnes (Encre, Classique)
    gridRow: { flexDirection: "row" },
    gridCell: { width: "50%", paddingRight: 8 },
  });

  // Titres de rubrique : chaque modèle a les siens
  const headingByDesign: Record<string, Style> = {
    encre: { fontSize: d.heading * 0.86, letterSpacing: 0.5, borderBottomWidth: 0.6, borderBottomColor: "#cbd5e1", paddingBottom: 3, marginBottom: d.headingAfter + 1 },
    classique: { letterSpacing: 0.5, borderBottomWidth: 1, borderBottomColor: "#111111", paddingBottom: 2 },
    precis: { fontSize: d.heading + 1.5, letterSpacing: 0.2, borderBottomWidth: 1.3, borderBottomColor: "#000000", paddingBottom: 1, marginBottom: Math.max(2, d.headingAfter - 2) },
    moderne: { letterSpacing: 0.4, borderBottomWidth: 0, borderLeftWidth: 3, borderLeftColor: style.accentColor, paddingLeft: 6, paddingBottom: 0 },
    minimaliste: { fontSize: d.heading + 0.5, letterSpacing: 0, borderBottomWidth: 0, paddingBottom: 0 },
  };
  const headingStyle = headingByDesign[design] ?? {};
  // En-tête (nom, accroche, coordonnées)
  const headerByDesign: Record<string, Style> = {
    classique: { borderBottomWidth: 1, borderBottomColor: "#111111", paddingBottom: d.summaryGap + 2 },
  };
  const nameByDesign: Record<string, Style> = {
    encre: { fontSize: d.name + 3, color: "#111827", letterSpacing: -0.3 },
    classique: { textTransform: "uppercase", letterSpacing: 0.8, color: "#111111" },
    precis: { fontSize: d.name + 6, textTransform: "uppercase", letterSpacing: 0.2, color: "#000000" },
    moderne: { fontSize: d.name + 4, color: "#111827" },
    minimaliste: { color: "#000000" },
  };
  const contactsColor = designed && design !== "minimaliste" && design !== "precis" ? muted : undefined;
  const contactSep = design === "precis" ? "  |  " : "  ·  ";
  const precisContacts: Style = design === "precis" ? { marginTop: 3, fontSize: d.small - 0.5 } : {};
  // Titre de rubrique dans une boîte : l'espace au-dessus est une marge interne de la boîte
  // (sûr aux sauts de page), et le texte lui-même n'a pas d'espace en haut — sinon le repère de
  // couleur du modèle Moderne débordait au-dessus du titre.
  const headingLabel = (text: string) =>
    // Minimaliste : casse uniforme (« Expérience », jamais « EXPÉRIENCE » à côté de « Profil »)
    design === "minimaliste" && text === text.toUpperCase() ? text.charAt(0) + text.slice(1).toLowerCase() : text;
  const headingBox = (text: string, extra: Style[], top: number = d.headingBefore) => (
    <View style={{ paddingTop: top }}>
      <Text style={[s.heading, headingStyle, ...extra]}>{headingLabel(text)}</Text>
    </View>
  );
  // Libellés de structure (pas des informations sur la personne) pour les modèles CV Woo
  const label = {
    profile: design === "precis" ? (fr ? "Résumé" : "Summary") : fr ? "Profil" : "Profile",
    contact: fr ? "Contact" : "Contact",
  };

  const SectionView = ({ section, onSide }: { section: Section; onSide: boolean }) => {
    const compact = onSide || ["skills", "languages", "qualities", "availability"].includes(section.kind);

    const header = (e: Entry) => {
      // Modèles CV Woo : « intitulé ……… dates » sur une ligne, puis entreprise et lieu en gris.
      // Le texte est seulement réparti, jamais modifié (voir splitEntryHeader).
      if (designed && design !== "minimaliste" && !compact && e.headerBlockIds.length > 0) {
        const { title, date, meta } = splitEntryHeader(e.headerBlockIds.map((id) => t(id)));
        // Précis : tout l'intitulé sur une ligne en gras (« Poste | Entreprise | Lieu »), dates à droite
        if (design === "precis") {
          return [
            <View key="row" style={s.titleRow}>
              <Text style={s.titleText}>{[title, ...meta].join(" | ")}</Text>
              {date && <Text style={[s.date, { fontSize: d.body, color: style.textColor }]}>{date}</Text>}
            </View>,
          ];
        }
        return [
          <View key="row" style={s.titleRow}>
            <Text style={s.titleText}>{title}</Text>
            {date && <Text style={s.date}>{date}</Text>}
          </View>,
          ...meta.map((m, j) => (
            <Text key={`m${j}`} style={s.meta}>
              {m}
            </Text>
          )),
        ];
      }
      return e.headerBlockIds.map((id, j) => (
        <Text key={id} style={j === 0 && !compact ? s.entryTitle : j === 0 ? {} : s.entryMeta}>
          {t(id)}
        </Text>
      ));
    };
    const dotColor = design === "encre" || design === "moderne" ? style.accentColor : undefined;

    // Un point n'est jamais coupé entre deux pages.
    // Les espacements sont des marges INTERNES (padding) des blocs insécables : le moteur PDF
    // déplace mal les marges externes d'un bloc renvoyé à la page suivante, ce qui faisait
    // chevaucher les textes juste avant un saut de page.
    const line = (e: Entry, id: string) => {
      const text = stripBullet(t(id));
      // Précis : « Langages : Python, SQL » avec la catégorie en gras, et dans une expérience ou une
      // formation, une ligne « Certifications : … » écrite sans puce reste sans puce
      const labelled =
        design === "precis" && !onSide ? (compact ? splitLabel(text) : e.headerBlockIds.length > 0 && LABEL_KINDS.has(section.kind) ? labelLine(t(id)) : null) : null;
      return compact || e.headerBlockIds.length === 0 || labelled ? (
        <View key={id} style={{ paddingTop: d.bulletGap }} wrap={false}>
          {labelled ? (
            <Text>
              <Text style={{ fontFamily: bold, fontWeight: 700 }}>{labelled.label} </Text>
              {labelled.rest}
            </Text>
          ) : (
            <Text>{text}</Text>
          )}
        </View>
      ) : (
        <View key={id} style={[s.bullet, { marginTop: 0, paddingTop: d.bulletGap }]} wrap={false}>
          <Text style={[s.dot, dotColor ? { color: dotColor } : {}, design === "precis" ? { width: 22, paddingLeft: 10 } : {}]}>•</Text>
          <Text style={s.bulletText}>{text}</Text>
        </View>
      );
    };

    // Une expérience peut se poursuivre sur la page suivante entre deux points,
    // mais son intitulé reste toujours avec son premier point.
    // Tous les blocs sont posés à plat dans la colonne (pas de bloc sécable qui en contient
    // d'insécables) : c'est cette imbrication qui provoquait les chevauchements.
    const entry = (e: Entry, i: number, withHeading: boolean) => {
      // Encre et Classique : compétences et langues courtes sur deux colonnes (lignes insécables)
      const items = e.bulletBlockIds.map((id) => stripBullet(t(id)));
      if (
        (design === "encre" || design === "classique") &&
        !onSide &&
        compact &&
        e.headerBlockIds.length === 0 &&
        items.length >= 3 &&
        items.every((x) => x.length <= 45)
      ) {
        const rows: string[][] = [];
        for (let k = 0; k < items.length; k += 2) rows.push(items.slice(k, k + 2));
        const rowView = (row: string[], r: number) => (
          <View key={`${i}-g${r}`} style={[s.gridRow, { paddingTop: r === 0 && i > 0 ? d.entryGap : d.bulletGap }]} wrap={false}>
            {row.map((x, c) => (
              <Text key={c} style={s.gridCell}>
                {x}
              </Text>
            ))}
          </View>
        );
        // Le titre de la rubrique reste avec la première ligne
        const [first, ...others] = rows;
        return [
          <View key={`${i}-g-head`} wrap={false}>
            {withHeading && headingText}
            {rowView(first, 0)}
          </View>,
          ...others.map((row, r) => rowView(row, r + 1)),
        ];
      }
      // Précis : filet fin gris entre deux expériences de la même rubrique
      const separated = design === "precis" && !compact && i > 0 && e.headerBlockIds.length > 0;
      const entryTop: Style = separated
        ? { marginTop: d.entryGap * 0.7, paddingTop: d.entryGap * 0.7, borderTopWidth: 0.8, borderTopColor: "#4b5563" }
        : { paddingTop: i === 0 ? 0 : d.entryGap };
      // Une expérience courte (jusqu'à 6 points) reste entière sur une même page
      if (!compact && e.headerBlockIds.length > 0 && e.bulletBlockIds.length <= 6) {
        return [
          <View key={`${i}-all`} style={entryTop} wrap={false}>
            {withHeading && headingText}
            {header(e)}
            {e.bulletBlockIds.map((id) => line(e, id))}
          </View>,
        ];
      }
      const [firstLine, ...otherLines] = e.bulletBlockIds;
      return [
        <View key={`${i}-head`} style={entryTop} wrap={false}>
          {withHeading && headingText}
          {header(e)}
          {firstLine && line(e, firstLine)}
        </View>,
        ...otherLines.map((id) => line(e, id)),
      ];
    };

    const headingText = headingBox(section.headingBlockId ? t(section.headingBlockId) : pdfSafe(section.heading), [
      { color: onSide && sidebarDark ? "#ffffff" : style.headingColor },
      onSide && sidebarDark ? { borderBottomColor: "#ffffff" } : {},
      // Moderne, colonne latérale : titre blanc souligné d'un filet fin, sans repère de couleur
      design === "moderne" && onSide ? { borderLeftWidth: 0, paddingLeft: 0, borderBottomWidth: 0.6, paddingBottom: 2 } : {},
    ]);

    if (section.entries.length === 0) return <View wrap={false}>{headingText}</View>;
    // Le titre de la rubrique reste toujours sur la même page que le début du premier élément
    return <>{section.entries.flatMap((e, i) => entry(e, i, i === 0))}</>;
  };

  const { main: mainSections, side: sideSections } = orderedSections(structure, sidebar, design);
  const contacts = structure.contactBlockIds.map(t).filter(Boolean);
  const fullName = [structure.nameBlockId, ...(structure.nameExtraBlockIds ?? [])].map(t).join(" ");
  // Titre du résumé : celui du CV ; à défaut, les modèles CV Woo affichent « Profil »
  const summaryHeading = structure.summaryHeadingBlockId ? t(structure.summaryHeadingBlockId) : designed ? label.profile : null;

  const header = (
    <View>
      <View style={headerByDesign[design] ?? {}}>
        {structure.nameBlockId && <Text style={[s.name, nameByDesign[design] ?? {}]}>{fullName}</Text>}
        {structure.headlineBlockId && (
          <Text style={[s.headline, design === "precis" ? { color: "#111111", fontSize: d.headline - 0.5, marginTop: 1 } : {}]}>
            {t(structure.headlineBlockId)}
          </Text>
        )}
        {!sidebar && contacts.length > 0 && (
          <Text style={[s.contacts, contactsColor ? { color: contactsColor } : {}, precisContacts]}>{contacts.join(contactSep)}</Text>
        )}
      </View>
      {summaryHeading && structure.summaryBlockIds.length > 0 && (
        headingBox(summaryHeading, [{ color: style.headingColor }])
      )}
      {structure.summaryBlockIds.map((id) => (
        <Text key={id} style={{ marginTop: design === "precis" ? 1 : d.summaryGap }}>
          {t(id)}
        </Text>
      ))}
    </View>
  );

  const side = sidebar ? (
    <View style={s.side}>
      {(structure.contactHeadingBlockId || design === "moderne") && contacts.length > 0 && (
        headingBox(
          structure.contactHeadingBlockId ? t(structure.contactHeadingBlockId) : label.contact,
          [
            { color: sidebarDark ? "#ffffff" : style.headingColor },
            sidebarDark ? { borderBottomColor: "#ffffff" } : {},
            design === "moderne" ? { borderLeftWidth: 0, paddingLeft: 0, borderBottomWidth: 0.6, paddingBottom: 2 } : {},
          ],
          0,
        )
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
