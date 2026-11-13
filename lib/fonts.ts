// Catalogue des polices libres utilisées pour reproduire la police d'un CV.
// Les polices propriétaires courantes sont remplacées par un équivalent aux mêmes dimensions
// (Arial → Arimo, Calibri → Carlito, Times New Roman → Tinos, Cambria → Caladea),
// pour que les lignes et les pages tombent au même endroit.

export type FontKey =
  | "montserrat" | "poppins" | "lato" | "roboto" | "open-sans" | "raleway" | "inter" | "nunito"
  | "source-sans-3" | "merriweather" | "playfair-display" | "lora" | "eb-garamond"
  | "arimo" | "tinos" | "carlito" | "caladea";

export const FONTS: Record<FontKey, { label: string; kind: "sans" | "serif" }> = {
  montserrat: { label: "Montserrat", kind: "sans" },
  poppins: { label: "Poppins", kind: "sans" },
  lato: { label: "Lato", kind: "sans" },
  roboto: { label: "Roboto", kind: "sans" },
  "open-sans": { label: "Open Sans", kind: "sans" },
  raleway: { label: "Raleway", kind: "sans" },
  inter: { label: "Inter", kind: "sans" },
  nunito: { label: "Nunito", kind: "sans" },
  "source-sans-3": { label: "Source Sans 3", kind: "sans" },
  merriweather: { label: "Merriweather", kind: "serif" },
  "playfair-display": { label: "Playfair Display", kind: "serif" },
  lora: { label: "Lora", kind: "serif" },
  "eb-garamond": { label: "EB Garamond", kind: "serif" },
  arimo: { label: "Arimo", kind: "sans" },
  tinos: { label: "Tinos", kind: "serif" },
  carlito: { label: "Carlito", kind: "sans" },
  caladea: { label: "Caladea", kind: "serif" },
};

// Noms de police (simplifiés) → police libre la plus proche
const ALIASES: Record<string, FontKey> = {
  montserrat: "montserrat",
  poppins: "poppins",
  lato: "lato",
  roboto: "roboto",
  opensans: "open-sans",
  raleway: "raleway",
  inter: "inter",
  nunito: "nunito",
  nunitosans: "nunito",
  sourcesans: "source-sans-3",
  sourcesanspro: "source-sans-3",
  sourcesans3: "source-sans-3",
  merriweather: "merriweather",
  playfairdisplay: "playfair-display",
  playfair: "playfair-display",
  lora: "lora",
  ebgaramond: "eb-garamond",
  garamond: "eb-garamond",
  adobegaramond: "eb-garamond",
  arial: "arimo",
  arimo: "arimo",
  helvetica: "arimo",
  helveticaneue: "arimo",
  liberationsans: "arimo",
  segoeui: "open-sans",
  verdana: "open-sans",
  tahoma: "open-sans",
  timesnewroman: "tinos",
  times: "tinos",
  tinos: "tinos",
  liberationserif: "tinos",
  georgia: "merriweather",
  bookantiqua: "eb-garamond",
  palatino: "eb-garamond",
  palatinolinotype: "eb-garamond",
  calibri: "carlito",
  carlito: "carlito",
  cambria: "caladea",
  caladea: "caladea",
  avenir: "nunito",
  avenirnext: "nunito",
  gillsans: "lato",
  century: "tinos",
  centurygothic: "montserrat",
  futura: "montserrat",
  trebuchetms: "open-sans",
};

/** « ABCDEF+Montserrat-SemiBold » → « Montserrat » (nom lisible de la famille). */
export function cleanFontName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const name = raw
    .replace(/^\//, "")
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/[-,](Bold|Italic|Regular|Light|Medium|SemiBold|Semibold|ExtraBold|Black|Thin|Oblique|BoldItalic|BoldMT|MT|PSMT|Book|Roman).*$/i, "")
    .replace(/(MT|PSMT|PS)$/, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
  return name || null;
}

/** Police libre correspondant à un nom de police, ou null si inconnue. */
export function matchFont(raw: string | null | undefined): FontKey | null {
  const clean = cleanFontName(raw);
  if (!clean) return null;
  const key = clean.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (ALIASES[key]) return ALIASES[key];
  // Correspondance partielle (« Montserrat Alternates » → Montserrat)
  const hit = Object.keys(ALIASES).find((a) => a.length >= 5 && key.startsWith(a));
  return hit ? ALIASES[hit] : null;
}

const ICON_FONTS = /(symbol|dingbat|fontawesome|awesome|icon|wingding|material)/i;

/** Polices d'un PDF (noms des dictionnaires de police), sans les polices d'icônes. */
export async function pdfFontNames(bytes: Uint8Array): Promise<string[]> {
  const { PDFDocument, PDFDict, PDFName } = await import("pdf-lib");
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const names = new Set<string>();
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && obj.get(PDFName.of("Type"))?.toString() === "/Font") {
        const clean = cleanFontName(obj.get(PDFName.of("BaseFont"))?.toString());
        if (clean && !ICON_FONTS.test(clean)) names.add(clean);
      }
    }
    return [...names];
  } catch {
    return [];
  }
}
