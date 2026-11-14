import { describe, expect, it } from "vitest";
import { computeScore } from "@/lib/scoring";
import type { SkillImportance, SkillMatch, SkillStatus } from "@/lib/cv/types";

const m = (importance: SkillImportance, status: SkillStatus): SkillMatch => ({
  skill: `${importance}-${status}`,
  importance,
  status,
  evidenceBlockId: null,
  evidenceQuote: null,
  advice: null,
});

describe("score de correspondance", () => {
  it("vaut 0 sans aucune compétence", () => {
    expect(computeScore([])).toBe(0);
  });

  it("vaut 100 quand tout est présent", () => {
    expect(computeScore([m("required", "present"), m("nice", "present"), m("keyword", "present")])).toBe(100);
  });

  it("vaut 0 quand tout manque", () => {
    expect(computeScore([m("required", "missing"), m("nice", "missing")])).toBe(0);
  });

  it("applique les poids 60 / 25 / 15", () => {
    // Seules les compétences obligatoires sont présentes : 60 %
    expect(computeScore([m("required", "present"), m("nice", "missing"), m("keyword", "missing")])).toBe(60);
    // Seuls les mots-clés sont présents : 15 %
    expect(computeScore([m("required", "missing"), m("nice", "missing"), m("keyword", "present")])).toBe(15);
  });

  it("compte une compétence « faible » pour moitié", () => {
    expect(computeScore([m("required", "weak")])).toBe(50);
    expect(computeScore([m("required", "present"), m("required", "weak")])).toBe(75);
  });

  it("ignore les catégories vides (pas de pénalité)", () => {
    expect(computeScore([m("nice", "present")])).toBe(100);
  });

  it("est reproductible : même entrée, même score", () => {
    const input = [m("required", "present"), m("required", "missing"), m("nice", "weak"), m("keyword", "present")];
    expect(computeScore(input)).toBe(computeScore([...input].reverse()));
  });
});
