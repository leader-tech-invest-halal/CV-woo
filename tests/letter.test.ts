import { describe, expect, it } from "vitest";
import { adaptedResumeText, buildLetter, countWords, type LetterDraft } from "@/lib/ai/letter-check";
import { renderLetterPdf } from "@/lib/export/letter-pdf";
import { applyTemplate, TEMPLATES } from "@/lib/export/templates";
import { NEW_SECTION_IDS } from "@/lib/cv/compose";
import { extractPdf } from "@/lib/cv/pdf";
import { makeCv } from "./helpers/cv";

// Lettre de motivation : tout ce que fait le code autour de l'unique appel à l'IA.
// CV fictif ; le texte de l'IA est simulé.

const cv = makeCv({ experiences: 2, bullets: 2 });
const bullet = cv.structure.sections[0].entries[0].bulletBlockIds[0];
const accepted = { [bullet]: "- Développement React en méthode agile.", [NEW_SECTION_IDS.qualities]: "Travail en équipe" };
const words = (n: number) => Array(n).fill("mot").join(" "); // texte de remplissage sans chiffres

const draft = (paragraphs: string[], extra: Partial<LetterDraft> = {}): LetterDraft => ({
  subject: "Candidature au poste de Développeuse web",
  salutation: "Madame, Monsieur,",
  paragraphs,
  closing: "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
  city: "Lyon",
  points_to_verify: [],
  ...extra,
});

describe("CV adapté lu par l'IA", () => {
  it("contient les propositions acceptées et les rubriques ajoutées", () => {
    const text = adaptedResumeText(cv, accepted);
    expect(text).toContain("Développement React en méthode agile");
    expect(text).toContain("Travail en équipe");
    expect(text).toContain("Camille Exemple");
  });
});

describe("lettre construite par le code", () => {
  const ctx = { resume: cv, accepted, locale: "fr" as const, company: "Société Exemple", sources: adaptedResumeText(cv, accepted), today: new Date("2026-11-21") };

  it("en-tête tiré du CV et de l'offre, date du jour, ville du CV", () => {
    const l = buildLetter(draft([words(280)]), ctx);
    expect(l.sender[0]).toBe("Camille Exemple");
    expect(l.sender).toContain("camille@exemple.fr");
    expect(l.recipient.split("\n")[0]).toBe("Société Exemple");
    expect(l.recipient).toContain("[À COMPLÉTER]");
    expect(l.placeDate).toBe("Lyon, le 21 novembre 2026");
    expect(l.body.startsWith("Madame, Monsieur,")).toBe(true);
  });

  it("une ville absente du CV n'est pas reprise", () => {
    expect(buildLetter(draft([words(280)], { city: "Marseille" }), ctx).placeDate.startsWith("[À COMPLÉTER]")).toBe(true);
  });

  it("signale un chiffre ou un outil absent du CV et des réponses", () => {
    const l = buildLetter(draft([`J'ai servi 120 clients par jour avec Salesforce. ${words(270)}`]), ctx);
    expect(l.checks.some((c) => c.includes("120"))).toBe(true);
    expect(l.checks.some((c) => c.includes("Salesforce"))).toBe(true);
  });

  it("une information donnée par la personne n'est pas signalée", () => {
    const l = buildLetter(draft([`Je peux travailler le samedi et j'habite à 10 minutes. ${words(270)}`]), {
      ...ctx,
      sources: ctx.sources + "\nJ'habite à 10 minutes",
    });
    expect(l.checks.filter((c) => c.includes("10"))).toEqual([]);
  });

  it("contrôle la longueur et l'entreprise manquante", () => {
    const l = buildLetter(draft([words(120)]), { ...ctx, company: null });
    expect(l.checks.some((c) => c.includes("120 mots"))).toBe(true);
    expect(l.checks.some((c) => c.includes("entreprise"))).toBe(true);
    expect(l.recipient.startsWith("[À COMPLÉTER]")).toBe(true);
    expect(countWords("Un, deux - trois l'été")).toBe(4);
  });
});

describe("PDF de la lettre", () => {
  const long = buildLetter(
    draft(Array.from({ length: 4 }, () => "Phrase de lettre assez longue pour remplir la page avec un texte réaliste. ".repeat(6))),
    { resume: cv, accepted, locale: "fr", company: "Société Exemple", sources: "" },
  );

  it.each(TEMPLATES)("modèle %s : une page, tout le texte", async (template) => {
    const { bytes, pages } = await renderLetterPdf(long, applyTemplate(cv.style, template));
    expect(pages).toBe(1);
    const text = (await extractPdf(bytes)).blocks.map((b) => b.text).join(" ").replace(/\s+/g, " ");
    expect(text).toContain("Candidature au poste de Développeuse web");
    expect(text).toContain("Société Exemple");
    expect(text).toContain("salutations distinguées");
  }, 60_000);
});

describe("mise en forme de l'objet", () => {
  it("retire « (H/F) » et élide « de » devant une voyelle", () => {
    const l = buildLetter(draft(["Texte."], { subject: "Candidature au poste de Équipier polyvalent (H/F)" }), {
      resume: cv,
      accepted: {},
      locale: "fr",
      company: "X",
      sources: "",
    });
    expect(l.subject).toBe("Candidature au poste d'Équipier polyvalent");
    expect(buildLetter(draft(["Le poste de Vendeur H/F me plaît."]), { resume: cv, accepted: {}, locale: "fr", company: "X", sources: "" }).body).toContain("Le poste de Vendeur me plaît.");
  });
});
