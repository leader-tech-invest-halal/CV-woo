// Modèle commun aux CV PDF et DOCX.
// Un CV est découpé en « blocs » (paragraphes ou lignes) identifiés par un id stable.
// L'IA ne recopie jamais le texte : elle référence des ids, et ses réécritures portent l'id du bloc d'origine.

export type SourceFormat = "pdf" | "docx";

export type Block = {
  id: string;
  text: string;
};

export type ResumeStyle = {
  accentColor: string; // #rrggbb
  textColor: string;
  headingColor: string;
  sidebarColor: string | null; // fond de la colonne latérale, si présente
  font: "sans" | "serif";
  /** Police du texte et des titres dans le CV d'origine (ex. « Calibri », « Montserrat »). */
  bodyFont: string | null;
  headingFont: string | null;
  layout: "single" | "sidebar-left" | "sidebar-right";
  headerAlign: "left" | "center";
  headingCase: "upper" | "normal";
  headingRule: boolean; // filet sous les titres de rubrique
};

export type SectionKind =
  | "experience"
  | "education"
  | "skills"
  | "languages"
  | "projects"
  | "certifications"
  | "interests"
  | "other";

export type ResumeStructure = {
  language: string;
  nameBlockId: string | null;
  /** Suite du nom quand il est écrit sur plusieurs lignes (ex. prénom puis NOM). */
  nameExtraBlockIds?: string[];
  headlineBlockId: string | null;
  contactBlockIds: string[];
  /** Titre de la zone de coordonnées (ex. « Contact »), s'il existe. */
  contactHeadingBlockId: string | null;
  /** Blocs rattachés automatiquement (non classés par l'IA) : jamais réécrits. */
  lockedBlockIds?: string[];
  summaryBlockIds: string[];
  sections: {
    headingBlockId: string | null;
    heading: string;
    kind: SectionKind;
    placement: "main" | "sidebar";
    entries: { headerBlockIds: string[]; bulletBlockIds: string[] }[];
  }[];
};

export type ParsedResume = {
  format: SourceFormat;
  fileName: string;
  blocks: Block[];
  structure: ResumeStructure;
  style: ResumeStyle;
};

export type SkillStatus = "present" | "weak" | "missing";
export type SkillImportance = "required" | "nice" | "keyword";

export type SkillMatch = {
  skill: string;
  importance: SkillImportance;
  status: SkillStatus;
  evidenceBlockId: string | null;
  evidenceQuote: string | null;
  advice: string | null;
};

export type Rewrite = {
  blockId: string;
  before: string;
  after: string;
  reason: string;
  keywords: string[];
  /** Problèmes détectés par la vérification automatique (vide = sûr). */
  flags: string[];
};

export type AnalysisResult = {
  offer: { title: string; company: string | null };
  score: number;
  matches: SkillMatch[];
  rewrites: Rewrite[];
  feedback: string;
};

export const DEFAULT_STYLE: ResumeStyle = {
  accentColor: "#047857",
  textColor: "#1f2937",
  headingColor: "#111827",
  sidebarColor: null,
  font: "sans",
  bodyFont: null,
  headingFont: null,
  layout: "single",
  headerAlign: "left",
  headingCase: "upper",
  headingRule: true,
};
