import type { Block, ResumeStructure } from "./types";

/**
 * Garantit qu'aucun bloc du CV n'est perdu : tout bloc que l'IA n'a pas rangé est rattaché
 * à l'élément qui le précède dans le document (ou au résumé s'il est tout en haut).
 */
export function completeStructure(blocks: Block[], structure: ResumeStructure): ResumeStructure {
  const s: ResumeStructure = structuredClone(structure);
  const used = new Set<string>([
    ...(s.nameBlockId ? [s.nameBlockId] : []),
    ...(s.nameExtraBlockIds ?? []),
    ...(s.headlineBlockId ? [s.headlineBlockId] : []),
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

/** Texte final d'un bloc : la réécriture acceptée si elle existe, sinon l'original. */
export function textResolver(blocks: Block[], accepted: Record<string, string>) {
  const map = new Map(blocks.map((b) => [b.id, accepted[b.id] ?? b.text]));
  return (id: string | null | undefined) => (id ? map.get(id) ?? "" : "");
}

/** Les polices standard des PDF ne couvrent que l'alphabet latin : on remplace le reste. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[•●▪■‣⁃∙]/g, "•")
    .replace(/[→➜➤]/g, "-")
    .replace(/[‐‑‒]/g, "-")
    .replace(/[^\u0009\u000A -~ -ÿŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™]/g, "")
    .trim();
}

export const stripBullet = (t: string) => t.replace(/^[•\-–·▪●■◦*]\s*/, "");
