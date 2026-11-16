import { describe, expect, it } from "vitest";
import { cleanHeadline, NEW_HEADLINE_ID, withNewHeadline } from "@/lib/cv/compose";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { extractDocx, rewriteDocx } from "@/lib/cv/docx";
import { extractPdf } from "@/lib/cv/pdf";
import JSZip from "jszip";
import { makeDocx } from "./helpers/fixtures";
import { makeCv } from "./helpers/cv";

// Titre du poste sous le nom, créé quand le CV n'en a pas (CV fictifs).

describe("titre du poste sous le nom", () => {
  it("nettoie l'intitulé de l'offre", () => {
    expect(cleanHeadline("Équipier polyvalent (H/F)")).toBe("Équipier polyvalent");
    expect(cleanHeadline("Équipier Polyvalent H/F - ")).toBe("Équipier Polyvalent");
    expect(cleanHeadline("Développeur web F/H/X – CDI")).toBe("Développeur web – CDI");
  });

  it("ajoute le titre juste sous le nom dans le PDF et le Word recomposés", async () => {
    const cv = makeCv({ experiences: 2, bullets: 2 });
    const noHeadline = { ...cv, structure: { ...cv.structure, headlineBlockId: null } };
    const accepted = { [NEW_HEADLINE_ID]: "Équipier polyvalent – emploi étudiant" };
    const resume = withNewHeadline(noHeadline, accepted);
    expect(resume.structure.headlineBlockId).toBe(NEW_HEADLINE_ID);

    const pdf = await renderResumePdf({ ...resume, accepted });
    const { blocks } = await extractPdf(pdf.bytes);
    const texts = blocks.map((b) => b.text);
    const name = texts.findIndex((t) => t.includes("Camille Exemple"));
    expect(texts[name + 1]).toContain("Équipier polyvalent");

    const docx = await renderResumeDocx({ ...resume, accepted });
    const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
    expect(xml.indexOf("Équipier polyvalent")).toBeGreaterThan(xml.indexOf("Camille Exemple"));
  });

  it("ne crée rien si la personne n'a pas accepté le titre", () => {
    const cv = makeCv({ experiences: 1, bullets: 1 });
    const noHeadline = { ...cv, structure: { ...cv.structure, headlineBlockId: null } };
    expect(withNewHeadline(noHeadline, {})).toBe(noHeadline);
  });

  it("insère le titre sous le nom dans le Word d'origine, sans décaler les autres modifications", async () => {
    const original = await makeDocx([
      { text: "CAMILLE EXEMPLE", bold: true },
      { text: "Étudiante sérieuse et motivée." },
      { text: "EXPÉRIENCE", bold: true },
      { text: "Accueil des clients" },
    ]);
    const out = await rewriteDocx(original, { d3: "Accueil et prise en charge des clients" }, { afterBlockIds: ["d0"], text: "Équipière polyvalente" });
    const { blocks } = await extractDocx(out);
    expect(blocks.map((b) => b.text)).toEqual([
      "CAMILLE EXEMPLE",
      "Équipière polyvalente",
      "Étudiante sérieuse et motivée.",
      "EXPÉRIENCE",
      "Accueil et prise en charge des clients",
    ]);
  });
});
