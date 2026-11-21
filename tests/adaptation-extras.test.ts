import { describe, expect, it } from "vitest";
import { checkSectionItems, duplicateOf, formatOnlyChange } from "@/lib/ai/guardrails";
import { extraProposals } from "@/lib/ai/analyze-check";
import { NEW_SECTION_IDS, orderedSections, withNewSections, withoutRemoved } from "@/lib/cv/compose";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { applyTemplate, TEMPLATES } from "@/lib/export/templates";
import { extractPdf } from "@/lib/cv/pdf";
import { extractDocx } from "@/lib/cv/docx";
import { makeCv } from "./helpers/cv";

// Nouvelles propositions de l'adaptation : doublons, corrections de forme, rubriques
// « Disponibilités » et « Qualités ». Tout est vérifié par le code (aucune invention possible).
// CV fictifs ; les réponses de l'IA sont simulées.

describe("corrections de forme seulement", () => {
  it("accepte la casse, les accents et la ponctuation", () => {
    expect(formatOnlyChange("camille exemple", "Camille EXEMPLE")).toBe(true);
    expect(formatOnlyChange("janv 2024 - juin 2024", "Janv. 2024 – Juin 2024")).toBe(true);
  });
  it("refuse un mot ou un chiffre ajouté (code postal, ville…)", () => {
    expect(formatOnlyChange("Lyon", "69001 Lyon")).toBe(false);
    expect(formatOnlyChange("Vendeuse", "Vendeuse confirmée")).toBe(false);
    expect(formatOnlyChange("Lyon", "Lyon")).toBe(false); // rien ne change
  });
});

describe("doublons", () => {
  const blocks = [
    { id: "a", text: "- Accueil et conseil des clients en boutique." },
    { id: "b", text: "• accueil et conseil des clients en boutique" },
    { id: "c", text: "- Gestion de la caisse." },
  ];
  it("reconnaît le même contenu, à la forme près", () => expect(duplicateOf("b", blocks)?.id).toBe("a"));
  it("ne confond pas deux puces différentes", () => expect(duplicateOf("c", blocks)).toBeNull());
});

describe("éléments d'une rubrique ajoutée", () => {
  const byId = new Map([["e1", { id: "e1", text: "- Disponible le samedi et le dimanche, travail en équipe de 5 vendeurs." }]]);
  it("un élément prouvé par un extrait exact est validé ; sinon il est à confirmer", () => {
    const items = checkSectionItems(
      [
        { text: "Disponible le week-end", evidence_block_id: "e1", evidence_quote: "Disponible le samedi et le dimanche" },
        { text: "Travail en équipe", evidence_block_id: "e1", evidence_quote: "travail en équipe de 5 vendeurs" },
        { text: "Ponctualité", evidence_block_id: "e1", evidence_quote: "toujours ponctuelle" },
        { text: "Disponible 35 h", evidence_block_id: "e1", evidence_quote: "Disponible le samedi" },
      ],
      byId,
    );
    expect(items.map((x) => x.proven)).toEqual([true, true, false, false]);
  });
});

describe("propositions supplémentaires de l'analyse", () => {
  const cv = makeCv({ experiences: 1, bullets: 3 });
  const bullets = cv.structure.sections[0].entries[0].bulletBlockIds;
  // Une puce en double, à la forme près
  const blocks = cv.blocks.map((b) => (b.id === bullets[2] ? { ...b, text: cv.blocks.find((x) => x.id === bullets[0])!.text.toUpperCase() } : b));
  const ctx = { blocks, structure: cv.structure, done: new Set<string>(), fr: true, conditions: ["Travail le week-end"] };

  it("retire un vrai doublon, refuse un faux", () => {
    const out = extraProposals(
      {
        removals: [
          { block_id: bullets[2], duplicate_of: bullets[0], reason: "Doublon" },
          { block_id: bullets[1], duplicate_of: bullets[0], reason: "Pas un doublon" },
        ],
        format_fixes: [],
        new_sections: [],
      },
      ctx,
    );
    expect(out.map((r) => [r.blockId, r.after])).toEqual([[bullets[2], ""]]);
  });

  it("corrige la forme du nom, refuse d'ajouter un code postal", () => {
    const contact = cv.structure.contactBlockIds[2]; // « Lyon »
    const out = extraProposals(
      {
        removals: [],
        format_fixes: [
          { block_id: cv.structure.nameBlockId!, new_text: "Camille EXEMPLE", reason: "Prénom NOM" },
          { block_id: contact, new_text: "69001 Lyon", reason: "Code postal" },
        ],
        new_sections: [],
      },
      ctx,
    );
    expect(out.map((r) => r.after)).toEqual(["Camille EXEMPLE"]);
  });

  it("ajoute une rubrique Qualités ; un élément non prouvé est à confirmer (non coché)", () => {
    const out = extraProposals(
      {
        removals: [],
        format_fixes: [],
        new_sections: [
          {
            kind: "qualities",
            items: [
              { text: "Travail en équipe", evidence_block_id: bullets[0], evidence_quote: "avec l'équipe produit" },
              { text: "Ponctualité", evidence_block_id: null, evidence_quote: null },
            ],
          },
        ],
      },
      ctx,
    );
    expect(out[0].blockId).toBe(NEW_SECTION_IDS.qualities);
    expect(out[0].after).toBe("Travail en équipe · Ponctualité");
    expect(out[0].flags).toEqual(["verify:Ponctualité"]);
  });
});

describe("export avec rubriques ajoutées et doublon retiré", () => {
  const cv = makeCv({ experiences: 2, bullets: 3 });
  const removed = cv.structure.sections[0].entries[0].bulletBlockIds[1];
  const accepted = {
    [NEW_SECTION_IDS.availability]: "Disponible le samedi et le dimanche",
    [NEW_SECTION_IDS.qualities]: "Travail en équipe · Sens du service",
    [removed]: "",
  };
  const removedText = cv.blocks.find((b) => b.id === removed)!.text.replace(/^- /, "");

  it("Disponibilités en tête, Qualités après les compétences, dans la colonne latérale en 2 colonnes", () => {
    const single = withNewSections(cv, accepted);
    expect(single.structure.sections.map((s) => s.kind)).toEqual(["availability", "experience", "education", "skills", "qualities", "languages"]);
    const side = orderedSections(withNewSections({ ...cv, style: applyTemplate(cv.style, "moderne") }, accepted).structure, true, "moderne").side;
    expect(side.map((s) => s.kind)).toEqual(["availability", "skills", "qualities", "languages"]);
  });

  it.each(TEMPLATES)("modèle %s : les rubriques ajoutées sont dans le PDF et le Word, le doublon n'y est plus", async (template) => {
    const style = applyTemplate(cv.style, template);
    const doc = withoutRemoved(withNewSections({ ...cv, style }, accepted), accepted);
    const pdf = await renderResumePdf({ ...doc, accepted });
    const docx = await renderResumeDocx({ ...doc, accepted });
    for (const text of [
      (await extractPdf(pdf.bytes)).blocks.map((b) => b.text).join("\n"),
      (await extractDocx(docx)).blocks.map((b) => b.text).join("\n"),
    ]) {
      const flat = text.replace(/\s+/g, " ").toLowerCase();
      expect(flat).toContain("disponible le samedi et le dimanche");
      expect(flat).toContain("sens du service");
      expect(flat).not.toContain(removedText.toLowerCase());
    }
  }, 60_000);
});
