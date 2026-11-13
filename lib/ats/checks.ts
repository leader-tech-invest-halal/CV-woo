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
};

export type OfferKeyword = { term: string; variants: string[]; importance: "required" | "nice" };

export type AtsReport = {
  score: number;
  checks: Check[];
  plainText: string;
  keywords: { found: string[]; missing: string[] } | null;
};

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){3,6}\d{2}/;

// Titres de rubrique standard reconnus par les ATS (français et anglais)
const SECTIONS: Record<"experience" | "education" | "skills", RegExp> = {
  experience: /^(experiences?( professionnelles?)?|parcours( professionnel)?|emplois?|work experience|experience|employment( history)?|professional experience)$/,
  education: /^(formations?|etudes|diplomes?|cursus|parcours (academique|scolaire)|education|academic background)$/,
  skills: /^(competences?( techniques| cles)?|savoir-faire|outils|skills|technical skills|key skills)$/,
};

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
    const source = normalize(text);
    const has = (k: OfferKeyword) => [k.term, ...k.variants].some((v) => v.trim() && source.includes(normalize(v)));
    const found = offerKeywords.filter(has).map((k) => k.term);
    const miss = offerKeywords.filter((k) => !has(k)).map((k) => k.term);
    const required = offerKeywords.filter((k) => k.importance === "required");
    const ratio = required.length ? required.filter(has).length / required.length : found.length / offerKeywords.length;
    add("keywords", "offer", ratio >= 0.7 ? "pass" : ratio >= 0.4 ? "warn" : "fail", 20, {
      percent: Math.round(ratio * 100),
      found: found.length,
      total: offerKeywords.length,
    });
    keywords = { found, missing: miss };
  }

  return { score: computeAtsScore(checks), checks, plainText: text, keywords };
}

export function computeAtsScore(checks: Check[]): number {
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.status === "pass" ? c.weight : c.status === "warn" ? c.weight / 2 : 0), 0);
  return total ? Math.round((got / total) * 100) : 0;
}

/** Rapport d'un fichier illisible (PDF scanné) : rien ne peut être lu par un ATS. */
export function unreadableReport(): AtsReport {
  return { score: 0, checks: [{ id: "readable", category: "readability", status: "fail", weight: 20 }], plainText: "", keywords: null };
}
