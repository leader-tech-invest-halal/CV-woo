import { describe, expect, it } from "vitest";
import { renderResumePdf } from "@/lib/export/pdf";
import { atsReadiness } from "@/lib/ats/readiness";
import { computeAtsScore, groupScores, keywordCheck, runChecks, type OfferKeyword } from "@/lib/ats/checks";
import type { Inspection } from "@/lib/ats/inspect";
import { makeCv } from "./helpers/cv";

// Score ATS : mots-clés de l'offre comptés avant / après, variantes de titres, détail par rubrique.
// CV fictifs. Cas d'origine : un test réel donnait 86 → 86 car les mots-clés n'étaient pas comptés.

const kw = (term: string, importance: OfferKeyword["importance"] = "required"): OfferKeyword => ({ term, importance, variants: [] });

function inspection(headings: string[]): Inspection {
  const blocks = [...headings, "camille@exemple.fr", "06 00 00 00 00"].map((text, i) => ({ id: `b${i}`, text }));
  return {
    format: "pdf",
    fileName: "cv.pdf",
    sizeBytes: 1000,
    pages: 1,
    blocks,
    plainText: blocks.map((b) => b.text).join("\n"),
    layout: { columns: false, tables: 0, textBoxes: 0, images: 0, headerFooterText: "" },
  };
}

describe("titres de rubrique reconnus, avec leurs variantes", () => {
  it.each([
    ["Expérience professionnelle", "Formation", "Compétences"],
    ["EXPÉRIENCES PROFESSIONNELLES", "FORMATION ACADÉMIQUE", "OUTILS INFORMATIQUES"],
    ["Parcours professionnel", "Diplômes", "Compétences & outils"],
    ["Stages et expériences", "Études", "Logiciels maîtrisés"],
    ["Work experience", "Education", "Technical skills"],
  ])("%s / %s / %s", (exp, edu, skills) => {
    const sections = runChecks(inspection([exp, edu, skills]), null).checks.find((c) => c.id === "sections")!;
    expect(sections.status).toBe("pass");
  });

  it("signale une rubrique vraiment absente", () => {
    const sections = runChecks(inspection(["Expérience", "Centres d'intérêt"]), null).checks.find((c) => c.id === "sections")!;
    expect(sections.status).toBe("fail");
    expect(sections.params?.missing).toBe("education,skills");
  });
});

describe("mots-clés de l'offre", () => {
  it("compte en proportion : chaque mot-clé ajouté fait progresser le score", () => {
    const keys = [kw("React"), kw("TypeScript"), kw("Tests"), kw("Figma", "nice")];
    const a = keywordCheck("Développement React", keys);
    const b = keywordCheck("Développement React et TypeScript", keys);
    expect(b.check.score!).toBeGreaterThan(a.check.score!);
    expect(b.found).toEqual(["React", "TypeScript"]);
    expect(b.missing).toEqual(["Tests", "Figma"]);
  });

  it("les indispensables comptent double", () => {
    const keys = [kw("React"), kw("Figma", "nice")];
    expect(keywordCheck("React", keys).check.score).toBeCloseTo(2 / 3);
    expect(keywordCheck("Figma", keys).check.score).toBeCloseTo(1 / 3);
  });

  it("le score du fichier généré progresse quand l'adaptation ajoute des mots-clés réels", async () => {
    const cv = makeCv({ experiences: 2, bullets: 2 });
    const keys = [kw("React"), kw("revue de code"), kw("intégration continue"), kw("méthode agile")];
    const before = await atsReadiness((await renderResumePdf(cv)).bytes, "pdf", "cv.pdf", keys);
    // L'adaptation reformule une puce avec un terme de l'offre déjà prouvé ailleurs dans le CV
    const bullet = cv.blocks.find((b) => b.text.startsWith("- Mission 1.1"))!;
    const accepted = { [bullet.id]: "- Mission 1.1 : développement React en méthode agile, avec intégration continue et revue de code." };
    const after = await atsReadiness((await renderResumePdf({ ...cv, accepted })).bytes, "pdf", "cv.pdf", keys);
    expect(after.score).toBeGreaterThan(before.score);
    expect(before.keywords?.missing).toEqual(["intégration continue", "méthode agile"]);
    expect(after.keywords?.found).toContain("méthode agile");
  });
});

describe("détail par rubrique", () => {
  it("donne un score par rubrique, et rien pour une rubrique sans contrôle", () => {
    const checks = runChecks(inspection(["Expérience", "Formation", "Compétences"]), null).checks;
    const groups = groupScores(checks);
    expect(groups.contact).toBe(100);
    expect(groups.vocabulary).toBeNull(); // pas d'offre : pas de vocabulaire
    expect(computeAtsScore(checks)).toBeGreaterThan(0);
  });
});

describe("qualité de rédaction", () => {
  const withText = (lines: string[]): Inspection => {
    const base = inspection(["Expérience", "Formation", "Compétences", ...lines]);
    return base;
  };

  it("signale l'accumulation de formules creuses, pas une seule", () => {
    const one = runChecks(withText(["Vendeuse dynamique en boutique"]), null).checks.find((c) => c.id === "cliches")!;
    expect(one.status).toBe("pass");
    const many = runChecks(withText(["Étudiante dynamique, motivée, rigoureuse et passionnée"]), null).checks.find((c) => c.id === "cliches")!;
    expect(many.status).toBe("warn");
    expect(many.params?.count).toBe(4);
  });

  it("signale les points de plus de deux lignes", () => {
    const long = "- " + "Gestion de la caisse et accueil des clients en magasin ".repeat(5);
    const checks = runChecks(withText([long, long]), null).checks;
    expect(checks.find((c) => c.id === "long_bullets")!.status).toBe("warn");
    const short = runChecks(withText(["- Accueil de 80 clients par jour"]), null).checks;
    expect(short.find((c) => c.id === "long_bullets")!.status).toBe("pass");
  });

  it("signale un mot-clé répété sans cesse (bourrage)", () => {
    const keys = [kw("React")];
    const stuffed = runChecks(withText(["React React React", "React et React", "Projet React"]), keys).checks;
    expect(stuffed.find((c) => c.id === "stuffing")!.status).toBe("warn");
    const natural = runChecks(withText(["Application React", "Tests de composants React"]), keys).checks;
    expect(natural.find((c) => c.id === "stuffing")!.status).toBe("pass");
  });
});
