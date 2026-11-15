import { describe, expect, it } from "vitest";
import { checkEnrichment } from "@/lib/ai/enrich-check";
import { enrichCandidates, toAnswers, type Draft } from "@/components/adapt/enrich-step";
import type { AnalysisResult, Block, ProfileAnswer, SkillMatch } from "@/lib/cv/types";

// « Enrichir mon profil » : seules les réponses de la personne peuvent compléter son CV.
// CV et réponses fictifs ; les propositions de l'IA sont simulées.

const blocks: Block[] = [
  { id: "b1", text: "Développeuse web — Société Fictive" },
  { id: "b2", text: "- Développement de fonctionnalités React avec l'équipe produit." },
  { id: "b3", text: "JavaScript, TypeScript, React" },
];
const byId = new Map(blocks.map((b) => [b.id, b]));
const editable = new Set(["b2", "b3"]);

const yes = (skill: string, extra: Partial<ProfileAnswer> = {}): ProfileAnswer => ({ skill, answer: "yes", entryId: "b1", ...extra });

describe("contrôle des propositions issues des réponses", () => {
  it("accepte une compétence confirmée et l'exemple donné par la personne", () => {
    const r = checkEnrichment(
      {
        rewrites: [
          { block_id: "b3", new_text: "JavaScript, TypeScript, React, Figma", reason: "Compétence confirmée", skills_used: ["Figma"] },
          {
            block_id: "b2",
            new_text: "- Développement de fonctionnalités React et maquettes Figma de l'application mobile avec l'équipe produit.",
            reason: "Exemple donné",
            skills_used: ["Figma"],
          },
        ],
        unplaced: [],
      },
      { answers: [yes("Figma", { example: "maquettes de l'application mobile" })], current: {} },
      byId,
      editable,
    );
    expect(r.rewrites).toHaveLength(2);
    expect(r.rewrites.every((w) => w.flags.length === 0 && w.source === "profile")).toBe(true);
    expect(r.rewrites[0].before).toBe("JavaScript, TypeScript, React");
    expect(r.unplaced).toEqual([]);
  });

  it("signale une durée ou un outil que la personne n'a pas donnés", () => {
    const r = checkEnrichment(
      {
        rewrites: [{ block_id: "b3", new_text: "JavaScript, TypeScript, React, Figma (3 ans), Sketch", reason: "", skills_used: ["Figma"] }],
        unplaced: [],
      },
      { answers: [yes("Figma")], current: {} },
      byId,
      editable,
    );
    expect(r.rewrites[0].flags).toContain("number:3");
    expect(r.rewrites[0].flags).toContain("term:Sketch");
  });

  it("autorise la durée quand c'est la personne qui l'a indiquée", () => {
    const r = checkEnrichment(
      { rewrites: [{ block_id: "b3", new_text: "JavaScript, TypeScript, React, Figma (2 ans)", reason: "", skills_used: ["Figma"] }], unplaced: [] },
      { answers: [yes("Figma", { duration: "2 ans" })], current: {} },
      byId,
      editable,
    );
    expect(r.rewrites[0].flags).toEqual([]);
  });

  it("n'écrit jamais une compétence pour laquelle la personne a seulement une expérience similaire", () => {
    const r = checkEnrichment(
      { rewrites: [{ block_id: "b3", new_text: "JavaScript, TypeScript, React, Power BI", reason: "", skills_used: ["Power BI"] }], unplaced: [] },
      { answers: [{ skill: "Power BI", answer: "similar", entryId: null, similar: "tableaux de bord sous Excel" }], current: {} },
      byId,
      editable,
    );
    expect(r.rewrites[0].flags).toContain("similar:Power BI");
    expect(r.rewrites[0].skills).toEqual([]); // pas comptée comme compétence intégrée
  });

  it("refuse les blocs non modifiables et indique les compétences non placées", () => {
    const r = checkEnrichment(
      { rewrites: [{ block_id: "b1", new_text: "Développeuse web Figma — Société Fictive", reason: "", skills_used: ["Figma"] }], unplaced: [] },
      { answers: [yes("Figma"), yes("Docker")], current: {} },
      byId,
      editable,
    );
    expect(r.rewrites).toEqual([]);
    expect(r.unplaced).toEqual(["Figma", "Docker"]);
  });

  it("part de la reformulation déjà proposée par l'analyse", () => {
    const current = { b3: "JavaScript, TypeScript, React, tests automatisés" };
    const r = checkEnrichment(
      { rewrites: [{ block_id: "b3", new_text: current.b3, reason: "", skills_used: [] }], unplaced: [] },
      { answers: [yes("Figma")], current },
      byId,
      editable,
    );
    expect(r.rewrites).toEqual([]); // rien de nouveau par rapport au texte actuel
  });
});

describe("questionnaire", () => {
  const match = (skill: string, importance: SkillMatch["importance"], status: SkillMatch["status"]): SkillMatch => ({
    skill,
    importance,
    status,
    evidenceBlockId: null,
    evidenceQuote: null,
    advice: null,
  });

  it("ne pose que les questions utiles, les indispensables d'abord, 8 au maximum", () => {
    const result = {
      matches: [
        match("React", "required", "present"),
        match("SEO", "keyword", "missing"),
        match("Figma", "nice", "missing"),
        match("Docker", "required", "missing"),
        match("Tests", "required", "weak"),
        ...Array.from({ length: 10 }, (_, i) => match(`Outil ${i}`, "keyword", "missing")),
      ],
    } as AnalysisResult;
    const c = enrichCandidates(result);
    expect(c.map((m) => m.skill).slice(0, 3)).toEqual(["Docker", "Tests", "Figma"]);
    expect(c).toHaveLength(8);
    expect(c.some((m) => m.skill === "React")).toBe(false);
  });

  it("n'envoie que les réponses « oui » et « expérience similaire », jamais les questions sans réponse", () => {
    const d = (answer: Draft["answer"], extra: Partial<Draft> = {}): Draft => ({
      answer,
      entryId: "",
      context: "",
      duration: "",
      example: "",
      similar: "",
      ...extra,
    });
    const answers = toAnswers({
      Figma: d("yes", { entryId: "b1", duration: " 2 ans " }),
      Docker: d("no"),
      SEO: d(null),
      "Power BI": d("similar", { similar: "Excel", entryId: "other", context: "projet perso" }),
    });
    expect(answers).toEqual([
      { skill: "Figma", answer: "yes", entryId: "b1", context: undefined, duration: "2 ans", example: undefined, similar: undefined },
      { skill: "Power BI", answer: "similar", entryId: null, context: "projet perso", duration: undefined, example: undefined, similar: "Excel" },
    ]);
  });
});
