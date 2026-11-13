import type { ResumeStyle } from "@/lib/cv/types";

// Modèles de CV proposés à l'export.
// « original » reprend le style détecté du CV de la personne (notre point fort) ;
// les autres sont des modèles une colonne, les plus sûrs pour les logiciels de recrutement.
export const TEMPLATES = ["original", "classique", "moderne", "minimaliste"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

export function applyTemplate(style: ResumeStyle, id: TemplateId): ResumeStyle {
  switch (id) {
    case "classique":
      return {
        ...style,
        layout: "single",
        sidebarColor: null,
        accentColor: "#111827",
        headingColor: "#111827",
        textColor: "#1f2937",
        font: "serif",
        bodyFont: "Times New Roman",
        headingFont: "Times New Roman",
        headerAlign: "center",
        headingCase: "upper",
        headingRule: true,
      };
    case "moderne":
      return {
        ...style,
        layout: "single",
        sidebarColor: null,
        // On garde la couleur de la personne, sur une mise en page sobre
        headingColor: style.accentColor,
        textColor: "#1f2937",
        font: "sans",
        bodyFont: "Inter",
        headingFont: "Inter",
        headerAlign: "left",
        headingCase: "upper",
        headingRule: false,
      };
    case "minimaliste":
      return {
        ...style,
        layout: "single",
        sidebarColor: null,
        accentColor: "#404040",
        headingColor: "#171717",
        textColor: "#262626",
        font: "sans",
        bodyFont: "Lato",
        headingFont: "Lato",
        headerAlign: "left",
        headingCase: "normal",
        headingRule: false,
      };
    default:
      return style;
  }
}
