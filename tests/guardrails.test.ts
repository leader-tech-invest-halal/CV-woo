import { describe, expect, it } from "vitest";
import { checkRewrite, normalize, verifyEvidence } from "@/lib/ai/guardrails";
import type { Block, SkillMatch } from "@/lib/cv/types";

// CV fictif utilisé pour les tests
const RESUME = [
  "Camille Exemple",
  "Développeuse web junior",
  "Stage chez Société Fictive : développement d'une application en React et Node.js.",
  "Correction de 12 bugs et amélioration des temps de chargement de 2,5 secondes.",
  "Compétences : JavaScript, HTML, CSS, Git.",
].join("\n");

const missing = (skill: string): SkillMatch => ({
  skill,
  importance: "required",
  status: "missing",
  evidenceBlockId: null,
  evidenceQuote: null,
  advice: null,
});

describe("garde-fous : ne jamais inventer", () => {
  it("n'alerte pas sur une reformulation fidèle", () => {
    const after = "Développement d'une application web en React et Node.js lors d'un stage chez Société Fictive.";
    expect(checkRewrite(after, [], RESUME, [])).toEqual([]);
  });

  it("signale un chiffre inventé", () => {
    const flags = checkRewrite("Correction de 30 bugs.", [], RESUME, []);
    expect(flags).toContain("number:30");
  });

  it("accepte un chiffre du CV écrit avec un point au lieu d'une virgule", () => {
    expect(checkRewrite("Gain de 2.5 secondes au chargement.", [], RESUME, [])).toEqual([]);
  });

  it("signale un outil ou un nom propre absent du CV", () => {
    const flags = checkRewrite("Déploiement avec Kubernetes et Docker.", [], RESUME, []);
    expect(flags).toContain("term:Kubernetes");
    expect(flags).toContain("term:Docker");
  });

  it("signale un sigle inventé", () => {
    expect(checkRewrite("Mise en place d'une démarche ISO pour l'équipe.", [], RESUME, [])).toContain("term:ISO");
  });

  it("signale un mot-clé qui revendique une compétence manquante", () => {
    const flags = checkRewrite("Développement d'une application.", ["TypeScript"], RESUME, [missing("TypeScript")]);
    expect(flags).toContain("keyword:TypeScript");
  });

  it("n'alerte pas sur un simple synonyme", () => {
    const flags = checkRewrite("Correction de 12 anomalies.", ["anomalies"], RESUME, [missing("Python")]);
    expect(flags).toEqual([]);
  });

  it("ne tient pas compte des accents ni de la casse", () => {
    expect(normalize("  Développeuse   WEB ")).toBe("developpeuse web");
    expect(checkRewrite("Expérience en javascript et git.", ["javascript"], RESUME, [])).toEqual([]);
  });
});

describe("preuves des compétences", () => {
  const blocks = new Map<string, Block>([
    ["l2", { id: "l2", text: "Stage chez Société Fictive : développement d'une application en React et Node.js." }],
  ]);
  const present = (quote: string | null, blockId: string | null = "l2"): SkillMatch => ({
    skill: "React",
    importance: "required",
    status: "present",
    evidenceBlockId: blockId,
    evidenceQuote: quote,
    advice: null,
  });

  it("garde une compétence dont la citation existe mot pour mot", () => {
    expect(verifyEvidence(present("application en React"), blocks).status).toBe("present");
  });

  it("rétrograde une compétence dont la citation n'existe pas", () => {
    const r = verifyEvidence(present("expert React depuis 5 ans"), blocks);
    expect(r.status).toBe("weak");
    expect(r.evidenceQuote).toBeNull();
  });

  it("rétrograde une compétence qui cite un bloc inexistant", () => {
    expect(verifyEvidence(present("application en React", "l99"), blocks).status).toBe("weak");
  });

  it("efface toute preuve d'une compétence manquante", () => {
    const r = verifyEvidence({ ...present("application en React"), status: "missing" }, blocks);
    expect(r.evidenceBlockId).toBeNull();
    expect(r.evidenceQuote).toBeNull();
  });
});
