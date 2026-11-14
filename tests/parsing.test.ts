import { describe, expect, it } from "vitest";
import { extractPdf } from "@/lib/cv/pdf";
import { extractDocx, rewriteDocx } from "@/lib/cv/docx";
import { detectFormat, MAX_FILE_BYTES } from "@/lib/cv/validate-file";
import { makeDocx, makeImagePdf, makePdf } from "./helpers/fixtures";

const codeOf = async (p: Promise<unknown>) => p.then(() => null, (e: { code?: string }) => e.code);

describe("type de fichier", () => {
  it("reconnaît un PDF et un DOCX par leur contenu", async () => {
    expect(detectFormat(await makePdf([{ text: "Test" }]))).toBe("pdf");
    expect(detectFormat(await makeDocx([{ text: "Test" }]))).toBe("docx");
  });

  it("refuse un autre type de fichier, même renommé", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(() => detectFormat(png)).toThrow("unsupported_file");
  });

  it("refuse un fichier de plus de 5 Mo", () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set([0x25, 0x50, 0x44, 0x46]);
    expect(() => detectFormat(big)).toThrow("file_too_large");
  });
});

describe("lecture d'un CV PDF", () => {
  const SUMMARY = [
    "Développeuse web curieuse et rigoureuse, je conçois des applications",
    "accessibles et rapides, en travaillant de près avec les équipes produit",
    "pour livrer des fonctionnalités utiles aux utilisateurs.",
  ];

  const cv = () =>
    makePdf([
      { text: "Camille Exemple", size: 20, gap: 30 },
      { text: "PROFIL", size: 12, gap: 18 },
      ...SUMMARY.map((text, i) => ({ text, gap: i === SUMMARY.length - 1 ? 22 : 12.5 })),
      { text: "EXPÉRIENCE", size: 12, gap: 18 },
      { text: "- Création d'un tableau de bord en React.", gap: 14 },
      { text: "- Écriture de tests automatisés.", gap: 14 },
      { text: "- Revue de code avec l'équipe.", gap: 14 },
    ]);

  it("garde tout le texte, dans l'ordre", async () => {
    const { blocks } = await extractPdf(await cv());
    const all = blocks.map((b) => b.text).join(" ");
    expect(all).toContain("Camille Exemple");
    expect(all.indexOf("PROFIL")).toBeLessThan(all.indexOf("EXPÉRIENCE"));
    expect(all.indexOf("tableau de bord")).toBeLessThan(all.indexOf("Revue de code"));
  });

  it("recolle un paragraphe coupé sur plusieurs lignes en un seul bloc", async () => {
    const { blocks } = await extractPdf(await cv());
    const summary = blocks.filter((b) => b.text.includes("curieuse") || b.text.includes("utilisateurs"));
    expect(summary).toHaveLength(1);
    expect(summary[0].text).toContain("équipes produit pour livrer");
  });

  it("garde chaque puce dans son propre bloc", async () => {
    const { blocks } = await extractPdf(await cv());
    const bullets = blocks.filter((b) => b.text.startsWith("-"));
    expect(bullets).toHaveLength(3);
  });

  it("ne mélange pas un titre de rubrique avec le texte qui suit", async () => {
    const { blocks } = await extractPdf(await cv());
    expect(blocks.some((b) => b.text === "EXPÉRIENCE")).toBe(true);
  });

  it("donne des identifiants uniques et stables", async () => {
    const a = (await extractPdf(await cv())).blocks.map((b) => b.id);
    const b = (await extractPdf(await cv())).blocks.map((b) => b.id);
    expect(new Set(a).size).toBe(a.length);
    expect(a).toEqual(b);
  });

  it("refuse un PDF sans texte (scanné) avec un message clair", async () => {
    expect(await codeOf(extractPdf(await makeImagePdf()))).toBe("scanned_pdf");
  });

  it("refuse un fichier PDF abîmé", async () => {
    const broken = new TextEncoder().encode("%PDF-1.7 pas vraiment un pdf");
    expect(await codeOf(extractPdf(broken))).toBe("unsupported_file");
  });
});

describe("lecture et réécriture d'un CV Word", () => {
  const cv = () =>
    makeDocx([
      { text: "Camille Exemple", bold: true },
      { text: "Expérience", bold: true, color: "1F7A5C" },
      { text: "Création d'un tableau de bord en React." },
      { text: "Écriture de tests automatisés." },
    ]);

  it("lit chaque paragraphe comme un bloc, avec les indices de mise en forme", async () => {
    const { blocks, formatHints } = await extractDocx(await cv());
    expect(blocks.map((b) => b.text)).toEqual([
      "Camille Exemple",
      "Expérience",
      "Création d'un tableau de bord en React.",
      "Écriture de tests automatisés.",
    ]);
    expect(formatHints).toContain("Calibri");
    expect(formatHints).toContain("#1F7A5C");
  });

  it("remplace uniquement le paragraphe réécrit et garde le reste intact", async () => {
    const original = await cv();
    const { blocks } = await extractDocx(original);
    const target = blocks.find((b) => b.text.startsWith("Création"))!;
    const out = await rewriteDocx(original, { [target.id]: "Conception d'un tableau de bord React pour l'équipe." });
    const after = await extractDocx(out);
    expect(after.blocks.map((b) => b.text)).toEqual([
      "Camille Exemple",
      "Expérience",
      "Conception d'un tableau de bord React pour l'équipe.",
      "Écriture de tests automatisés.",
    ]);
    // La mise en forme d'origine est conservée (police et couleur)
    expect(after.formatHints).toContain("Calibri");
    expect(after.formatHints).toContain("#1F7A5C");
  });

  it("refuse un document Word vide", async () => {
    expect(await codeOf(extractDocx(await makeDocx([{ text: "" }])))).toBe("empty_resume");
  });
});
