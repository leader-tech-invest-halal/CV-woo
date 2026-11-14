// Réglages de mise en page communs au PDF et au Word (tailles en points typographiques).
// Du plus aéré au plus serré : en mode « compact », on garde le premier réglage qui tient
// sur une page. On resserre d'abord les espaces, puis les interlignes, et la police en dernier,
// sans jamais descendre sous 9 pt. Aucun texte n'est supprimé, raccourci ou masqué.

export const LAYOUT_MODES = ["compact", "detailed"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export type Density = {
  body: number; // texte courant
  small: number; // dates, lieux, coordonnées
  lineHeight: number; // interligne (multiple de la taille)
  margin: number; // marges de la page
  name: number;
  headline: number;
  heading: number; // titres de rubrique
  headingBefore: number; // espace avant un titre de rubrique
  headingAfter: number;
  entryGap: number; // espace entre deux expériences
  bulletGap: number; // espace entre deux points
  summaryGap: number;
};

export const DENSITIES: readonly Density[] = [
  // 0 · Aéré (mode détaillé, et premier essai du mode compact)
  { body: 10, small: 9, lineHeight: 1.4, margin: 36, name: 22, headline: 12, heading: 11.5, headingBefore: 14, headingAfter: 6, entryGap: 6, bulletGap: 1.5, summaryGap: 8 },
  // 1 · Espaces resserrés
  { body: 10, small: 9, lineHeight: 1.32, margin: 32, name: 20, headline: 11.5, heading: 11, headingBefore: 10, headingAfter: 4, entryGap: 5, bulletGap: 1, summaryGap: 6 },
  // 2 · Interligne resserré
  { body: 9.5, small: 8.5, lineHeight: 1.25, margin: 28, name: 19, headline: 11, heading: 10.5, headingBefore: 8, headingAfter: 3, entryGap: 4, bulletGap: 0.5, summaryGap: 5 },
  // 3 · Le plus serré encore confortable à lire
  { body: 9, small: 8, lineHeight: 1.2, margin: 26, name: 18, headline: 10.5, heading: 10, headingBefore: 7, headingAfter: 3, entryGap: 3, bulletGap: 0.5, summaryGap: 4 },
];

export const MIN_BODY_SIZE = 9;
