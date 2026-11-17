import { normalize } from "@/lib/ai/guardrails";
import type { Inspection } from "./inspect";

// Règles du vérificateur ATS. Tout est calculé par le code, de façon reproductible.
// Chaque contrôle renvoie un statut et des paramètres ; les textes affichés sont dans messages/*.json.

export type CheckStatus = "pass" | "warn" | "fail";
export type CheckCategory = "readability" | "content" | "file" | "offer";

export type Check = {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  weight: number;
  params?: Record<string, string | number>;
  /** Part obtenue de 0 à 1 quand le contrôle est proportionnel (ex. mots-clés trouvés) */
  score?: number;
};

export type OfferKeyword = { term: string; variants: string[]; importance: "required" | "nice" };

export type AtsReport = {
  score: number;
  checks: Check[];
  plainText: string;
  keywords: { found: string[]; missing: string[] } | null;
};

/** Lisibilité seule (sans offre), pour comparer le CV d'origine et le CV exporté. */
export type AtsReadiness = { score: number; checks: Check[]; keywords?: { found: string[]; missing: string[] } };

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){3,6}\d{2}/;

// Titres de rubrique standard reconnus par les ATS (français et anglais), avec leurs variantes
// courantes (« Expériences professionnelles », « Formation académique », « Outils informatiques »,
// « Compétences & outils »…). Le titre doit COMMENCER par l'un de ces mots (40 caractères au plus).
const SECTIONS: Record<"experience" | "education" | "skills", RegExp> = {
  experience:
    /^(experiences?|parcours( professionnel)?$|emplois?|stages?( et experiences?)?|work experience|professional experience|employment( history)?)\b/,
  education:
    /^(formations?|etudes|diplomes?|cursus|parcours (academique|scolaire|universitaire)|education|academic background|qualifications)\b/,
  skills:
    /^(competences?|savoir[- ]faire|savoir[- ]etre|outils|logiciels|informatique|skills|technical skills|key skills|hard skills|soft skills|tools)\b/,
};

/** Regroupement des contrôles par rubrique, pour le détail du score (avant / après). */
export const CHECK_GROUPS: Record<string, string[]> = {
  contact: ["email", "phone", "contact_header"],
  structure: ["sections", "dates", "pages"],
  content: ["length", "quantified"],
  readability: ["readable", "layout", "icons", "images"],
  vocabulary: ["keywords"],
};

/** Score de 0 à 100 de chaque rubrique (null si aucun contrôle de cette rubrique). */
export function groupScores(checks: Check[]): Record<string, number | null> {
  return Object.fromEntries(
    Object.entries(CHECK_GROUPS).map(([g, ids]) => {
      const list = checks.filter((c) => ids.includes(c.id));
      return [g, list.length ? computeAtsScore(list) : null];
    }),
  );
}

/**
 * Mots-clés de l'offre présents dans un texte (CV d'origine ou fichier généré), comme les cherche
 * un logiciel de recrutement : le mot exact, accents et majuscules ignorés. Les indispensables
 * comptent double. Le score est proportionnel : chaque mot-clé ajouté se voit.
 */
export function keywordCheck(text: string, offerKeywords: OfferKeyword[]) {
  const source = normalize(text);
  const has = (k: OfferKeyword) => [k.term, ...k.variants].some((v) => v.trim() && source.includes(normalize(v)));
  const found = offerKeywords.filter(has).map((k) => k.term);
  const missing = offerKeywords.filter((k) => !has(k)).map((k) => k.term);
  const weight = (k: OfferKeyword) => (k.importance === "required" ? 2 : 1);
  const total = offerKeywords.reduce((s, k) => s + weight(k), 0);
  const got = offerKeywords.filter(has).reduce((s, k) => s + weight(k), 0);
  const ratio = total ? got / total : 0;
  const check: Check = {
    id: "keywords",
    category: "offer",
    status: ratio >= 0.7 ? "pass" : ratio >= 0.4 ? "warn" : "fail",
    weight: 20,
    score: ratio,
    params: { percent: Math.round(ratio * 100), found: found.length, total: offerKeywords.length },
  };
  return { check, found, missing };
}

// Caractères des polices d'icônes (zone privée Unicode) et emojis : illisibles pour un ATS
const ICONS = /[-]|[\u{1F300}-\u{1FAFF}]|[☀-➿]/gu;

const DATE_FORMATS: [string, RegExp][] = [
  ["MM/AAAA", /\b(0?[1-9]|1[0-2])[/.-](19|20)\d{2}\b/],
  ["mois AAAA", /\b(janv|fevr|mars|avr|mai|juin|juil|aout|sept|oct|nov|dec|jan|feb|mar|apr|may|jun|jul|aug|sep)[a-z]*\.?\s+(19|20)\d{2}\b/i],
  ["AAAA seule", /(^|[^/\d])(19|20)\d{2}\s*[–-]\s*((19|20)\d{2}|aujourd|present|actuel|en cours)/i],
];

export function runChecks(insp: Inspection, offerKeywords: OfferKeyword[] | null): AtsReport {
  const checks: Check[] = [];
  const text = insp.plainText;
  const words = text.split(/\s+/).filter(Boolean).length;
  const add = (id: string, category: CheckCategory, status: CheckStatus, weight: number, params?: Check["params"]) =>
    checks.push({ id, category, status, weight, params });

  // ——— Lisibilité ———
  add("readable", "readability", "pass", 20);

  const layoutIssues = [
    insp.layout.columns && "columns",
    insp.layout.tables > 0 && "tables",
    insp.layout.textBoxes > 0 && "textboxes",
  ].filter(Boolean) as string[];
  add("layout", "readability", layoutIssues.length ? "warn" : "pass", 12, { issues: layoutIssues.join(",") });

  const icons = text.match(ICONS)?.length ?? 0;
  add("icons", "readability", icons > 3 ? "warn" : "pass", 6, { count: icons });

  if (insp.format === "docx") {
    add("images", "readability", insp.layout.images > 1 ? "warn" : "pass", 4, { count: insp.layout.images });
  }

  // ——— Contenu ———
  const email = EMAIL.test(text);
  const phone = PHONE.test(text.replace(EMAIL, ""));
  const contactOnlyInHeader =
    !email && EMAIL.test(insp.layout.headerFooterText) ? "email" : !phone && PHONE.test(insp.layout.headerFooterText) ? "phone" : null;
  if (contactOnlyInHeader) add("contact_header", "content", "fail", 10);
  else add("email", "content", email ? "pass" : "fail", 10);
  add("phone", "content", phone || contactOnlyInHeader === "phone" ? "pass" : "warn", 4);

  const headings = insp.blocks
    .map((b) => normalize(b.text).replace(/[:•\-–]/g, "").trim())
    .filter((t) => t.length <= 40);
  const missing = (Object.keys(SECTIONS) as (keyof typeof SECTIONS)[]).filter(
    (k) => !headings.some((h) => SECTIONS[k].test(h)),
  );
  add("sections", "content", missing.length === 0 ? "pass" : missing.length === 1 ? "warn" : "fail", 14, {
    missing: missing.join(","),
  });

  add("length", "content", words < 200 ? "warn" : words > 1100 ? "warn" : "pass", 6, {
    words,
    issue: words < 200 ? "short" : words > 1100 ? "long" : "ok",
  });

  // Résultats chiffrés : nombres qui ne sont ni des années, ni des dates, ni un téléphone
  const quantified = insp.blocks.filter((b) => {
    const t = b.text.replace(EMAIL, "").replace(PHONE, "");
    return /(\d+\s?(%|k€|€|m€|k|x|\+)|\b\d{1,3}\s+(personnes|clients|projets|collaborateurs|people|clients|projects|users|utilisateurs)\b)/i.test(t);
  }).length;
  add("quantified", "content", quantified >= 2 ? "pass" : "warn", 6, { count: quantified });

  const formats = DATE_FORMATS.filter(([, re]) => re.test(text)).map(([name]) => name);
  add("dates", "content", formats.length === 0 ? "warn" : formats.length > 1 ? "warn" : "pass", 4, {
    formats: formats.join(", "),
    issue: formats.length === 0 ? "none" : formats.length > 1 ? "mixed" : "ok",
  });

  // ——— Fichier ———
  const pages = insp.pages;
  if (pages !== null) {
    add("pages", "file", pages <= 2 ? "pass" : pages === 3 ? "warn" : "fail", 6, { pages });
  }
  add("size", "file", insp.sizeBytes > 2 * 1024 * 1024 ? "warn" : "pass", 2, {
    size: Math.round(insp.sizeBytes / 1024),
  });
  const generic =
    /^(document|sans titre|untitled|cv|resume|curriculum( vitae)?|mon cv|nouveau document)?[\s_\-()\d]*\.(pdf|docx)$/i.test(insp.fileName) ||
    /(final|copie|copy|v\d|version)/i.test(insp.fileName);
  add("file_name", "file", generic ? "warn" : "pass", 2, { name: insp.fileName });

  // ——— Offre (optionnel) ———
  let keywords: AtsReport["keywords"] = null;
  if (offerKeywords && offerKeywords.length) {
    const k = keywordCheck(text, offerKeywords);
    checks.push(k.check);
    keywords = { found: k.found, missing: k.missing };
  }

  return { score: computeAtsScore(checks), checks, plainText: text, keywords };
}

export function computeAtsScore(checks: Check[]): number {
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce(
    (s, c) => s + (c.score !== undefined ? c.weight * c.score : c.status === "pass" ? c.weight : c.status === "warn" ? c.weight / 2 : 0),
    0,
  );
  return total ? Math.round((got / total) * 100) : 0;
}

/** Rapport d'un fichier illisible (PDF scanné) : rien ne peut être lu par un ATS. */
export function unreadableReport(): AtsReport {
  return { score: 0, checks: [{ id: "readable", category: "readability", status: "fail", weight: 20 }], plainText: "", keywords: null };
}
