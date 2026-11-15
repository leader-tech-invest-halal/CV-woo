import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { extractPdf } from "@/lib/cv/pdf";
import { DENSITIES, MIN_BODY_SIZE } from "@/lib/export/layout";
import { makeCv } from "./helpers/cv";
import { normalize } from "@/lib/ai/guardrails";

// Mise en page de l'export : une page quand c'est possible, sans jamais perdre de contenu.
// CV fictifs fabriqués à la volée (aucune donnée réelle).

/** Tout le texte du PDF généré, sans accents ni espaces superflus. */
async function pdfText(bytes: Uint8Array) {
  const { blocks } = await extractPdf(bytes);
  return normalize(blocks.map((b) => b.text).join(" ")).replace(/\s+/g, " ");
}

/** Vérifie que chaque bloc du CV figure dans le fichier, en entier. */
async function expectNothingLost(cv: ReturnType<typeof makeCv>, bytes: Uint8Array) {
  const text = await pdfText(bytes);
  for (const b of cv.blocks) {
    expect(text, `bloc manquant : ${b.text}`).toContain(normalize(b.text.replace(/^-\s*/, "")).replace(/\s+/g, " "));
  }
}

describe("export PDF : nombre de pages", () => {
  it("garde un CV étudiant court sur une page, avec la mise en page aérée", async () => {
    const cv = makeCv({ experiences: 2, bullets: 3 });
    const pdf = await renderResumePdf(cv, "compact");
    expect(pdf.pages).toBe(1);
    expect(pdf.level).toBe(0);
    await expectNothingLost(cv, pdf.bytes);
  });

  it("fait tenir sur une page un CV avec plusieurs expériences en resserrant la mise en page", async () => {
    const cv = makeCv({ experiences: 6, bullets: 4 });
    expect((await renderResumePdf(cv, "detailed")).pages).toBe(2);
    const pdf = await renderResumePdf(cv, "compact");
    expect(pdf.pages).toBe(1);
    expect(pdf.level).toBeGreaterThan(0);
    await expectNothingLost(cv, pdf.bytes);
  });

  it("fait tenir sur une page un CV en deux colonnes", async () => {
    const cv = makeCv({ experiences: 5, bullets: 4, sidebar: true });
    expect((await renderResumePdf(cv, "detailed")).pages).toBe(2);
    const pdf = await renderResumePdf(cv, "compact");
    expect(pdf.pages).toBe(1);
    await expectNothingLost(cv, pdf.bytes);
  });

  it("laisse sur deux pages lisibles un CV trop riche, sans rien supprimer", async () => {
    const cv = makeCv({ experiences: 9, bullets: 4 });
    const pdf = await renderResumePdf(cv, "compact");
    expect(pdf.pages).toBe(2);
    expect(pdf.level).toBe(0); // pas de compression inutile si une page est impossible
    await expectNothingLost(cv, pdf.bytes);
  });

  it("garde le mode détaillé aéré", async () => {
    const cv = makeCv({ experiences: 6, bullets: 4 });
    const pdf = await renderResumePdf(cv, "detailed");
    expect(pdf.level).toBe(0);
    await expectNothingLost(cv, pdf.bytes);
  });

  it("ne descend jamais sous 9 pt pour le texte", () => {
    for (const d of DENSITIES) expect(d.body).toBeGreaterThanOrEqual(MIN_BODY_SIZE);
  });
});

describe("export Word", () => {
  it("reprend le même réglage que le PDF et garde tout le texte", async () => {
    const cv = makeCv({ experiences: 6, bullets: 4 });
    const { level } = await renderResumePdf(cv, "compact");
    expect(level).toBeGreaterThan(0);
    const docx = await renderResumeDocx(cv, level);
    const zip = await JSZip.loadAsync(docx);
    const xml = await zip.file("word/document.xml")!.async("string");
    const styles = await zip.file("word/styles.xml")!.async("string");
    // Page A4 et taille du texte identique au PDF (en demi-points)
    expect(xml).toContain(`w:w="11906" w:h="16838"`);
    expect(styles).toContain(`w:sz w:val="${Math.round(DENSITIES[level].body * 2)}"`);
    const text = xml
      .replace(/<[^>]+>/g, "")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
    for (const b of cv.blocks) expect(text).toContain(b.text.replace(/^-\s*/, ""));
  });
});
