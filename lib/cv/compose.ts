import type { Block, DesignId, ParsedResume, ResumeStructure } from "./types";

/**
 * Titre du poste visé, créé sous le nom quand le CV n'en a pas.
 * Ce n'est pas un fait inventé : c'est l'objectif de la candidature (l'intitulé de l'offre).
 */
export const NEW_HEADLINE_ID = "headline-new";

/** Nettoie un intitulé d'offre pour l'afficher sous le nom : sans « H/F », sans retour à la ligne. */
export function cleanHeadline(title: string): string {
  return title
    .replace(/[([]?\s*\b(?:H|F|M)\s*\/\s*(?:H|F|M)(?:\s*\/\s*X)?\b\s*[)\]]?/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—|,:]+|[\s\-–—|,:]+$/g, "")
    .slice(0, 90)
    .trim();
}

/**
 * Si la personne a accepté le titre créé et que son CV n'avait pas de ligne sous le nom,
 * l'ajoute au CV à exporter (PDF et Word recomposés).
 */
export function withNewHeadline<T extends Pick<ParsedResume, "blocks" | "structure">>(resume: T, accepted: Record<string, string>): T {
  const text = accepted[NEW_HEADLINE_ID]?.trim();
  if (!text || resume.structure.headlineBlockId) return resume;
  return {
    ...resume,
    blocks: [...resume.blocks, { id: NEW_HEADLINE_ID, text: "" }],
    structure: { ...resume.structure, headlineBlockId: NEW_HEADLINE_ID },
  };
}

/**
 * Rubriques ajoutées par CV Woo à l'étape d'adaptation, quand l'offre le justifie et seulement
 * avec des informations réelles du CV : « Disponibilités » (conditions impératives de l'offre,
 * ex. horaires) et « Qualités » (savoir-être demandés, prouvés par le CV). Le texte accepté est
 * une liste d'éléments séparés par « · ».
 */
export const NEW_SECTION_IDS = { availability: "section-new:availability", qualities: "section-new:qualities" } as const;
export type NewSectionKind = keyof typeof NEW_SECTION_IDS;
const NEW_SECTION_HEADINGS: Record<NewSectionKind, { fr: string; en: string }> = {
  availability: { fr: "Disponibilités", en: "Availability" },
  qualities: { fr: "Qualités", en: "Qualities" },
};

export const isNewSectionId = (id: string): boolean => (Object.values(NEW_SECTION_IDS) as string[]).includes(id);

/** Éléments d'une rubrique ajoutée, à partir du texte accepté (« a · b · c »). */
export function sectionItems(text: string): string[] {
  return text
    .split(/\s*(?:·|•|;|\n)\s*/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((x) => x.slice(0, 120));
}

/** Ajoute au CV à exporter les rubriques créées que la personne a acceptées. */
export function withNewSections<T extends Pick<ParsedResume, "blocks" | "structure" | "style">>(resume: T, accepted: Record<string, string>): T {
  const fr = (resume.structure.language ?? "fr").startsWith("fr");
  const twoColumns = resume.style.layout !== "single";
  let blocks = resume.blocks;
  let sections = resume.structure.sections;
  for (const kind of Object.keys(NEW_SECTION_IDS) as NewSectionKind[]) {
    const id = NEW_SECTION_IDS[kind];
    const items = sectionItems(accepted[id] ?? "");
    if (!items.length) continue;
    const heading = NEW_SECTION_HEADINGS[kind][fr ? "fr" : "en"];
    const headingId = `${id}:h`;
    const itemIds = items.map((_, i) => `${id}:${i}`);
    blocks = [...blocks, { id: headingId, text: heading }, ...items.map((text, i) => ({ id: itemIds[i], text }))];
    const section: ResumeStructure["sections"][number] = {
      headingBlockId: headingId,
      heading,
      kind,
      placement: twoColumns ? "sidebar" : "main",
      entries: [{ headerBlockIds: [], bulletBlockIds: itemIds }],
    };
    if (kind === "availability") {
      // Condition impérative : mise en évidence en tête du CV
      sections = [section, ...sections];
    } else {
      // Qualités : juste après les compétences (ou à la fin s'il n'y en a pas)
      const skills = sections.findIndex((x) => x.kind === "skills");
      sections = skills < 0 ? [...sections, section] : [...sections.slice(0, skills + 1), section, ...sections.slice(skills + 1)];
    }
  }
  return { ...resume, blocks, structure: { ...resume.structure, sections } };
}

/**
 * Retire du CV à exporter les blocs que la personne a choisi de supprimer (doublons) : leur
 * texte accepté est vide. Une expérience ou une rubrique vidée par ce retrait disparaît.
 */
export function withoutRemoved<T extends Pick<ParsedResume, "structure">>(resume: T, accepted: Record<string, string>): T {
  const removed = new Set(Object.entries(accepted).filter(([, text]) => text.trim() === "").map(([id]) => id));
  if (!removed.size) return resume;
  const sections = resume.structure.sections
    .map((section) => ({
      ...section,
      entries: section.entries
        .map((e) => ({ ...e, bulletBlockIds: e.bulletBlockIds.filter((id) => !removed.has(id)) }))
        .filter((e) => e.headerBlockIds.length + e.bulletBlockIds.length > 0),
    }))
    .filter((section) => section.entries.length > 0);
  return {
    ...resume,
    structure: { ...resume.structure, sections, summaryBlockIds: resume.structure.summaryBlockIds.filter((id) => !removed.has(id)) },
  };
}

/**
 * Chaque bloc n'apparaît qu'une seule fois dans le CV. Si l'IA a rangé un même bloc à deux
 * endroits (cause des titres et dates affichés en double), on garde la première place, dans
 * l'ordre du CV : nom, accroche, coordonnées, résumé, puis les rubriques. Une rubrique ou une
 * expérience vidée par ce nettoyage est retirée.
 */
export function dedupeStructure(s: ResumeStructure): ResumeStructure {
  const seen = new Set<string>();
  const keep = (id: string | null | undefined) => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const one = (id: string | null) => (keep(id) ? id : null);
  const list = (ids: string[]) => ids.filter(keep);

  // Ordre de priorité : le titre du résumé passe avant les coordonnées (« PROFIL » rangé dans
  // les coordonnées par erreur était affiché au bout de la ligne e-mail · téléphone)
  const nameBlockId = one(s.nameBlockId);
  const nameExtraBlockIds = list(s.nameExtraBlockIds ?? []);
  const headlineBlockId = one(s.headlineBlockId);
  const summaryHeadingBlockId = one(s.summaryHeadingBlockId ?? null);
  const out: ResumeStructure = {
    ...s,
    nameBlockId,
    nameExtraBlockIds,
    headlineBlockId,
    summaryHeadingBlockId,
    contactBlockIds: list(s.contactBlockIds),
    contactHeadingBlockId: one(s.contactHeadingBlockId),
    summaryBlockIds: list(s.summaryBlockIds),
    sections: [],
  };
  for (const section of s.sections) {
    const headingBlockId = one(section.headingBlockId);
    const entries = section.entries
      .map((e) => ({ headerBlockIds: list(e.headerBlockIds), bulletBlockIds: list(e.bulletBlockIds) }))
      .filter((e) => e.headerBlockIds.length || e.bulletBlockIds.length);
    // Rubrique sans titre propre ni contenu propre : c'était un doublon complet
    if (!headingBlockId && entries.length === 0) continue;
    out.sections.push({ ...section, headingBlockId, entries });
  }
  return out;
}

/**
 * Garantit qu'aucun bloc du CV n'est perdu : tout bloc que l'IA n'a pas rangé est rattaché
 * à l'élément qui le précède dans le document (ou au résumé s'il est tout en haut).
 */
export function completeStructure(blocks: Block[], structure: ResumeStructure): ResumeStructure {
  const s: ResumeStructure = dedupeStructure(structuredClone(structure));
  // Filet de sécurité : un titre « PROFIL / RÉSUMÉ / À PROPOS » rangé dans les coordonnées
  // devient le titre du résumé (sinon il s'affichait au bout de la ligne des coordonnées)
  const textOf = (id: string) => blocks.find((b) => b.id === id)?.text ?? "";
  const misplaced = s.contactBlockIds.find((id) =>
    /^(profil( professionnel)?|r[ée]sum[ée]|[àa] propos( de moi)?|pr[ée]sentation|about( me)?|summary|profile)\s*:?$/i.test(textOf(id).trim()),
  );
  if (misplaced) {
    s.contactBlockIds = s.contactBlockIds.filter((id) => id !== misplaced);
    // Sinon, il est rattaché plus bas comme bloc non classé (jamais perdu)
    if (!s.summaryHeadingBlockId && s.summaryBlockIds.length) s.summaryHeadingBlockId = misplaced;
  }
  const used = new Set<string>([
    ...(s.nameBlockId ? [s.nameBlockId] : []),
    ...(s.nameExtraBlockIds ?? []),
    ...(s.headlineBlockId ? [s.headlineBlockId] : []),
    ...(s.summaryHeadingBlockId ? [s.summaryHeadingBlockId] : []),
    ...s.contactBlockIds,
    ...(s.contactHeadingBlockId ? [s.contactHeadingBlockId] : []),
    ...s.summaryBlockIds,
  ]);
  // Où ranger la suite d'un bloc donné
  const owner = new Map<string, string[]>();
  if (s.contactHeadingBlockId) owner.set(s.contactHeadingBlockId, s.contactBlockIds);
  owner.set("__summary", s.summaryBlockIds);
  for (const id of s.contactBlockIds) owner.set(id, s.contactBlockIds);
  for (const id of s.summaryBlockIds) owner.set(id, s.summaryBlockIds);
  for (const section of s.sections) {
    if (section.headingBlockId) used.add(section.headingBlockId);
    for (const e of section.entries) {
      for (const id of [...e.headerBlockIds, ...e.bulletBlockIds]) {
        used.add(id);
        owner.set(id, e.bulletBlockIds);
      }
    }
    if (section.headingBlockId) {
      if (section.entries.length === 0) section.entries.push({ headerBlockIds: [], bulletBlockIds: [] });
      owner.set(section.headingBlockId, section.entries[0].bulletBlockIds);
    }
  }

  let target = s.summaryBlockIds;
  for (const b of blocks) {
    if (used.has(b.id)) {
      target = owner.get(b.id) ?? target;
      continue;
    }
    target.push(b.id);
    // Bloc rangé par sécurité, pas par l'IA : il ne sera jamais réécrit
    s.lockedBlockIds = [...(s.lockedBlockIds ?? []), b.id];
    owner.set(b.id, target);
    used.add(b.id);
  }
  return s;
}

/**
 * Rubriques à afficher dans la colonne principale et dans la colonne latérale.
 * Sans colonne latérale (modèle une colonne), les rubriques qui étaient sur le côté du CV
 * d'origine (compétences, langues, centres d'intérêt…) passent APRÈS les rubriques principales
 * (expérience, formation) : sinon l'expérience arrivait tout en bas, après les langues.
 */
export function orderedSections(structure: ResumeStructure, sidebar: boolean, design: DesignId = "original") {
  // Modèles CV Woo : ordre standard des recruteurs, et colonne latérale choisie par type de rubrique
  if (design !== "original") {
    const order: readonly string[] = design === "precis" ? PRECIS_ORDER : KIND_ORDER;
    const rank = (k: string) => {
      const i = order.indexOf(k);
      return i < 0 ? order.length : i;
    };
    const sorted = structure.sections.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x.kind) - rank(b.x.kind) || a.i - b.i).map((o) => o.x);
    if (!sidebar) return { main: sorted, side: [] as typeof sorted };
    // Colonne imposée par l'équilibrage automatique (voir lib/export/balance.ts), sinon selon le type
    const onSide = (x: (typeof sorted)[number]) => (x.forced ? x.forced === "sidebar" : SIDE_KINDS.has(x.kind));
    return { main: sorted.filter((x) => !onSide(x)), side: sorted.filter(onSide) };
  }
  const placed = (x: ResumeStructure["sections"][number]) => x.forced ?? x.placement;
  const main = structure.sections.filter((x) => placed(x) !== "sidebar");
  const side = structure.sections.filter((x) => placed(x) === "sidebar");
  return sidebar ? { main, side } : { main: [...main, ...side], side: [] as typeof side };
}

/** Ordre standard des rubriques : profil (en-tête), expérience, formation, compétences, langues…
 *  « Disponibilités » (conditions impératives de l'offre) vient en tête, « Qualités » suit les compétences. */
const KIND_ORDER = ["availability", "experience", "education", "skills", "qualities", "languages", "certifications", "projects", "interests", "other"] as const;
/** Modèle Précis : compétences en tête (profils techniques, étudiants), projets avant la formation */
const PRECIS_ORDER = ["availability", "skills", "qualities", "experience", "projects", "education", "certifications", "languages", "interests", "other"] as const;
/** Rubriques placées dans la colonne latérale des modèles à deux colonnes (éléments courts) */
const SIDE_KINDS = new Set(["availability", "skills", "qualities", "languages", "interests"]);

const DATE_PART =
  /\b(19|20)\d{2}\b|aujourd.hui|pr[ée]sent|actuel|en cours|depuis|\b(janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c)[a-zé]*\.?\s/i;

/**
 * En-tête d'une expérience découpé pour la mise en page : intitulé, dates (alignées à droite
 * dans les modèles), et le reste (entreprise, lieu). Aucun texte n'est perdu ni modifié :
 * les morceaux sont seulement répartis. Ex. « Paris | Mai 2024 – 2025 » → lieu « Paris »,
 * dates « Mai 2024 – 2025 ».
 */
/** Ligne « Catégorie : valeurs » d'une rubrique de compétences (le texte n'est jamais modifié). */
export function splitLabel(text: string): { label: string; rest: string } | null {
  // La catégorie garde exactement sa ponctuation (« Langages : » ou « Languages: »)
  const m = /^([^:•|]{2,40}:)\s+(\S.*)$/.exec(text);
  return m ? { label: m[1], rest: m[2] } : null;
}

/** Réglages serrés du modèle Précis (dense comme le modèle de référence), à partir d'un réglage donné. */
export function precisDensity<T extends { lineHeight: number; bulletGap: number }>(d: T): T {
  return { ...d, lineHeight: Math.min(d.lineHeight, 1.27), bulletGap: Math.min(d.bulletGap, 0.6) };
}

/**
 * Ligne « Catégorie : valeurs » écrite sans puce dans une expérience ou une formation
 * (ex. « Certifications : AWS ») : le modèle Précis l'affiche comme une ligne, catégorie en gras.
 */
/** Rubriques où une ligne « Catégorie : … » sans puce est fréquente (formation, certifications) */
export const LABEL_KINDS: ReadonlySet<string> = new Set(["education", "certifications"]);

export function labelLine(raw: string): { label: string; rest: string } | null {
  if (/^\s*[•\-–·▪●■◦*]/.test(raw)) return null;
  return splitLabel(raw.trim());
}

export function splitEntryHeader(lines: string[]): { title: string; date: string | null; meta: string[] } {
  const [title = "", ...rest] = lines;
  let date: string | null = null;
  const meta: string[] = [];
  for (const line of rest) {
    if (date) {
      meta.push(line);
      continue;
    }
    const parts = line.split(/\s+[|·•]\s+/);
    const i = parts.findIndex((p) => DATE_PART.test(p) && p.length <= 40);
    if (i < 0) {
      meta.push(line);
      continue;
    }
    date = parts[i].trim();
    const others = parts.filter((_, j) => j !== i).join(" · ").trim();
    if (others) meta.push(others);
  }
  return { title, date, meta };
}

/** Texte final d'un bloc : la réécriture acceptée si elle existe, sinon l'original. */
export function textResolver(blocks: Block[], accepted: Record<string, string>) {
  const map = new Map(blocks.map((b) => [b.id, accepted[b.id] ?? b.text]));
  return (id: string | null | undefined) => (id ? map.get(id) ?? "" : "");
}

/** Les polices standard des PDF ne couvrent que l'alphabet latin : on remplace le reste. */
export function pdfSafe(text: string): string {
  return text
    // Espaces spéciaux (insécable, fine, demi-cadratin… souvent mis par Word) → espace normale.
    // Sans cela, le filtre ci-dessous les supprimait et collait les mots (« Chefdeprojet »).
    .replace(/[   -   　]/g, " ")
    // Caractères invisibles (largeur nulle) : supprimés sans coller les mots qui les entourent
    .replace(/[​-‍⁠﻿]/g, "")
    .replace(/[•●▪■‣⁃∙]/g, "•")
    .replace(/[→➜➤]/g, "-")
    .replace(/[‐‑‒]/g, "-")
    .replace(/[^\u0009\u000A -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export const stripBullet = (t: string) => t.replace(/^[•\-–·▪●■◦*]\s*/, "");
