import { describe, expect, it } from "vitest";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { atsReadiness } from "@/lib/ats/readiness";
import { makeImagePdf, makePdf } from "./helpers/fixtures";
import { makeCv } from "./helpers/cv";

// Contrôle ATS « avant / après » de l'adaptation : sans IA, sur les vrais fichiers.

const status = (r: Awaited<ReturnType<typeof atsReadiness>>, id: string) => r.checks.find((c) => c.id === id)?.status;

describe("lisibilité ATS du CV exporté", () => {
  it("valide la mise en page d'un export en une colonne, en PDF comme en Word", async () => {
    const cv = makeCv({ experiences: 3, bullets: 3 });
    const pdf = await renderResumePdf(cv, "compact");
    const fromPdf = await atsReadiness(pdf.bytes, "pdf", "camille-cv-woo.pdf");
    expect(status(fromPdf, "readable")).toBe("pass");
    expect(status(fromPdf, "layout")).toBe("pass");
    expect(status(fromPdf, "sections")).toBe("pass");
    expect(status(fromPdf, "email")).toBe("pass");
    expect(status(fromPdf, "pages")).toBe("pass");

    const docx = await renderResumeDocx(cv, pdf.level);
    const fromDocx = await atsReadiness(docx, "docx", "camille-cv-woo.docx");
    expect(status(fromDocx, "layout")).toBe("pass");
    expect(status(fromDocx, "sections")).toBe("pass");
  });

  it("reste lisible avec un modèle à colonne latérale", async () => {
    const r = await atsReadiness(
      (await renderResumePdf(makeCv({ experiences: 4, bullets: 3, sidebar: true }))).bytes,
      "pdf",
      "a.pdf",
    );
    expect(status(r, "readable")).toBe("pass");
    expect(status(r, "sections")).toBe("pass");
    expect(status(r, "email")).toBe("pass");
  });

  it("montre le progrès par rapport à un CV d'origine mal structuré", async () => {
    // CV d'origine : titres de rubrique non standards, pas de coordonnées
    const before = await atsReadiness(
      await makePdf([
        { text: "Camille Exemple", size: 18 },
        { text: "Mon parcours" },
        { text: "Développeuse web chez Société Fictive" },
        { text: "Ce que je sais faire" },
        { text: "React, TypeScript" },
      ]),
      "pdf",
      "cv.pdf",
    );
    const after = await atsReadiness((await renderResumePdf(makeCv({ experiences: 3, bullets: 3 }))).bytes, "pdf", "cv.pdf");
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("ne compte ni le nom ni le poids du fichier, qui changent à l'export", async () => {
    const r = await atsReadiness((await renderResumePdf(makeCv({ experiences: 2, bullets: 2 }))).bytes, "pdf", "CV final v2.pdf");
    expect(r.checks.map((c) => c.id)).not.toContain("file_name");
    expect(r.checks.map((c) => c.id)).not.toContain("size");
  });

  it("donne 0 à un fichier sans texte lisible", async () => {
    const r = await atsReadiness(await makeImagePdf(), "pdf", "scan.pdf");
    expect(r.score).toBe(0);
    expect(status(r, "readable")).toBe("fail");
  });
});
