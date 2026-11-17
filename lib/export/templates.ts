import type { ResumeStyle } from "@/lib/cv/types";

// Modèles de CV proposés à l'export. Chacun a sa propre structure, pas seulement d'autres couleurs :
// - « original » : le design du CV de la personne (couleurs, police, colonnes), par défaut ;
// - « encre » : une colonne, titres en majuscules espacées, filets fins, dates alignées à droite,
//   compétences sur deux colonnes ; sobre, moderne, très lisible par les logiciels de recrutement ;
// - « classique » : une colonne, en-tête centré, police à empattement, filets noirs, noir et blanc ;
// - « moderne » : deux colonnes, barre latérale colorée (coordonnées, compétences, langues),
//   titres avec repère de couleur ;
// - « minimaliste » : une colonne, noir et blanc, titres standards, aucun élément graphique,
//   la structure la plus simple pour les logiciels de recrutement (ATS).
export const TEMPLATES = ["original", "encre", "classique", "moderne", "minimaliste"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

/** Modèles en une colonne, conseillés pour les logiciels de recrutement */
export const ATS_SAFE: ReadonlySet<TemplateId> = new Set(["encre", "classique", "minimaliste"]);

export function applyTemplate(style: ResumeStyle, id: TemplateId): ResumeStyle {
  switch (id) {
    case "encre":
      return {
        ...style,
        design: "encre",
        layout: "single",
        sidebarColor: null,
        accentColor: "#1e3a5f", // bleu encre
        headingColor: "#1e3a5f",
        textColor: "#1f2937",
        font: "sans",
        bodyFont: "Inter",
        headingFont: "Inter",
        headerAlign: "left",
        headingCase: "upper",
        headingRule: true,
      };
    case "classique":
      return {
        ...style,
        design: "classique",
        layout: "single",
        sidebarColor: null,
        accentColor: "#111111",
        headingColor: "#111111",
        textColor: "#222222",
        font: "serif",
        bodyFont: "Tinos",
        headingFont: "Tinos",
        headerAlign: "center",
        headingCase: "upper",
        headingRule: true,
      };
    case "moderne": {
      // La couleur de la personne si elle est assez foncée pour du texte blanc, sinon un vert sapin
      const accent = isDark(style.accentColor) ? style.accentColor : "#0f4c45";
      return {
        ...style,
        design: "moderne",
        layout: "sidebar-left",
        sidebarColor: accent,
        accentColor: accent,
        headingColor: accent,
        textColor: "#1f2937",
        font: "sans",
        bodyFont: "Poppins",
        headingFont: "Poppins",
        headerAlign: "left",
        headingCase: "upper",
        headingRule: false,
      };
    }
    case "minimaliste":
      return {
        ...style,
        design: "minimaliste",
        layout: "single",
        sidebarColor: null,
        accentColor: "#000000",
        headingColor: "#000000",
        textColor: "#111111",
        font: "sans",
        bodyFont: "Arimo",
        headingFont: "Arimo",
        headerAlign: "left",
        headingCase: "normal",
        headingRule: false,
      };
    default:
      return { ...style, design: "original" };
  }
}

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return false;
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.5;
}
