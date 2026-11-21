import { checkRewrite } from "./guardrails";
import { orderedSections, textResolver, withNewHeadline, withNewSections, withoutRemoved } from "@/lib/cv/compose";
import type { Block, CoverLetter, ResumeStructure, ResumeStyle } from "@/lib/cv/types";

// Lettre de motivation : tout ce qui ne demande pas l'IA (testable sans appel payant).
// - le CV adapté en texte simple (ce que l'IA lit) ;
// - l'en-tête (expéditeur, destinataire, lieu et date), construit à partir du CV et de l'offre ;
// - la vérification : chiffres, noms propres et outils absents du CV et des réponses, longueur.

export const TO_COMPLETE = { fr: "[À COMPLÉTER]", en: "[TO COMPLETE]" } as const;

type Resume = { blocks: Block[]; structure: ResumeStructure; style?: ResumeStyle };

/** CV adapté (propositions acceptées, rubriques ajoutées, doublons retirés) en texte simple. */
export function adaptedResumeText(resume: Resume, accepted: Record<string, string>): string {
  const style = resume.style ?? ({ layout: "single" } as ResumeStyle);
  const doc = withoutRemoved(withNewSections(withNewHeadline({ ...resume, style }, accepted), accepted), accepted);
  const t = textResolver(doc.blocks, accepted);
  const s = doc.structure;
  const lines = [
    [s.nameBlockId, ...(s.nameExtraBlockIds ?? [])].map(t).filter(Boolean).join(" "),
    t(s.headlineBlockId),
    s.contactBlockIds.map(t).filter(Boolean).join(" · "),
    ...s.summaryBlockIds.map(t),
  ];
  const { main } = orderedSections(s, false);
  for (const section of main) {
    lines.push("", (section.headingBlockId ? t(section.headingBlockId) : section.heading).toUpperCase());
    for (const e of section.entries) lines.push(...e.headerBlockIds.map(t), ...e.bulletBlockIds.map(t));
  }
  return lines.filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Ce que renvoie l'IA (voir prompts/lettre.ts). */
export type LetterDraft = {
  subject: string;
  salutation: string;
  paragraphs: string[];
  closing: string;
  city: string;
  points_to_verify: string[];
};

/**
 * Lettre finale : en-tête construit par le code, corps rédigé par l'IA, puis vérifications.
 * sources : textes dont la lettre a le droit de citer les faits (CV adapté, réponses du candidat,
 * intitulé, entreprise et conditions de l'offre).
 */
export function buildLetter(
  draft: LetterDraft,
  ctx: {
    resume: Resume;
    accepted: Record<string, string>;
    locale: "fr" | "en";
    company: string | null;
    sources: string;
    today?: Date;
  },
): CoverLetter {
  const fr = ctx.locale === "fr";
  const missing = TO_COMPLETE[ctx.locale];
  const t = textResolver(ctx.resume.blocks, ctx.accepted);
  const s = ctx.resume.structure;
  const name = [s.nameBlockId, ...(s.nameExtraBlockIds ?? [])].map(t).filter(Boolean).join(" ");
  const contacts = s.contactBlockIds.map(t).filter(Boolean);
  const clean = (x: string) => x.replace(/\s+/g, " ").trim();

  // La ville n'est gardée que si elle figure vraiment dans le CV
  const resumeText = adaptedResumeText(ctx.resume, ctx.accepted);
  const city = clean(draft.city);
  const cityOk = city.length > 1 && resumeText.toLowerCase().includes(city.toLowerCase());
  const date = (ctx.today ?? new Date()).toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" });

  // « (H/F) » recopié de l'offre : retiré partout
  const noGender = (x: string) => clean(x.replace(/\s*[([]?\s*\b[HFM]\s*\/\s*[HFM](?:\s*\/\s*X)?\b\s*[)\]]?/g, " "));
  const paragraphs = draft.paragraphs.map(noGender).filter(Boolean).slice(0, 6);
  const body = [clean(draft.salutation), ...paragraphs, clean(draft.closing)].filter(Boolean).join("\n\n");

  // Vérifications du code, en plus des points signalés par l'IA
  const checks = draft.points_to_verify.map(clean).filter(Boolean).slice(0, 8);
  const flags = checkRewrite(paragraphs.join("\n"), [], ctx.sources, []);
  for (const f of flags) {
    const [kind, ...rest] = f.split(":");
    const value = rest.join(":");
    checks.push(
      kind === "number"
        ? fr
          ? `Le chiffre « ${value} » n'apparaît ni dans votre CV ni dans vos réponses : vérifiez-le.`
          : `The figure "${value}" is not in your resume or your answers: please check it.`
        : fr
          ? `« ${value} » n'apparaît ni dans votre CV ni dans vos réponses : vérifiez-le.`
          : `"${value}" is not in your resume or your answers: please check it.`,
    );
  }
  const words = countWords(paragraphs.join(" "));
  if (words < 230 || words > 340) {
    checks.push(
      fr
        ? `La lettre fait ${words} mots (conseillé : 250 à 320). Ajustez-la si besoin.`
        : `The letter is ${words} words long (recommended: 250 to 320). Adjust it if needed.`,
    );
  }
  if (!ctx.company) checks.push(fr ? "Indiquez le nom de l'entreprise et son adresse dans le destinataire." : "Add the company name and address in the recipient.");

  return {
    sender: [name || missing, ...contacts],
    recipient: [ctx.company?.trim() || `${missing} ${fr ? "(entreprise)" : "(company)"}`, `${missing} ${fr ? "(adresse)" : "(address)"}`].join("\n"),
    placeDate: fr ? `${cityOk ? city : missing}, le ${date}` : `${cityOk ? city : missing}, ${date}`,
    // Objet : sans « (H/F) », et « de » élidé devant une voyelle (« d'Équipier », pas « de Équipier »)
    subject: elide(noGender(draft.subject)),
    body,
    signature: name || missing,
    checks: [...new Set(checks)],
    words,
  };
}

/** « de » devant une voyelle : « d'» (« Candidature au poste d'Équipier », pas « de Équipier »). */
export const elide = (text: string) => text.replace(/\bde (?=[aeiouyàâéèêëîïôöûüAEIOUYÀÂÉÈÊËÎÏÔÖÛÜ])/g, "d'");

export const countWords = (text: string) => (text.match(/[\p{L}\d][\p{L}\d'’-]*/gu) ?? []).length;
