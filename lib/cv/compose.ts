import type { Block, ParsedResume, ResumeStructure } from "./types";

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
export function orderedSections(structure: ResumeStructure, sidebar: boolean) {
  const main = structure.sections.filter((x) => x.placement !== "sidebar");
  const side = structure.sections.filter((x) => x.placement === "sidebar");
  return sidebar ? { main, side } : { main: [...main, ...side], side: [] as typeof side };
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
