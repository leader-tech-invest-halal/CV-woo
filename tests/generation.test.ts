import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdf } from "@/lib/cv/pdf";
import { completeStructure, dedupeStructure, pdfSafe } from "@/lib/cv/compose";
import { renderResumePdf } from "@/lib/export/pdf";
import { makeCv } from "./helpers/cv";

// Défauts constatés lors de l'audit (17/11/2026), corrigés à la source. CV fictifs.

async function pdfWith(draw: (page: import("pdf-lib").PDFPage, font: import("pdf-lib").PDFFont) => void) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  draw(page, font);
  return doc.save();
}

describe("espaces entre les mots", () => {
  it("garde les espaces spéciaux à l'export PDF (fine, insécable, demi-cadratin)", () => {
    expect(pdfSafe("Chef de projet")).toBe("Chef de projet");
    expect(pdfSafe("Compétences : React")).toBe("Compétences : React");
    expect(pdfSafe("Paris – 2024")).toBe("Paris – 2024");
    expect(pdfSafe("mot insécable")).toBe("mot insécable");
    expect(pdfSafe("sans​espace")).toBe("sansespace"); // caractère invisible : retiré
  });

  it("garde les espaces d'un texte serré à l'import PDF", async () => {
    const bytes = await pdfWith((page, font) => {
      let x = 50;
      for (const w of "Gestion de la relation client et accueil des clients en magasin".split(" ")) {
        page.drawText(w, { x, y: 700, size: 9, font });
        x += font.widthOfTextAtSize(w, 9) + 1.2; // écart de 1,2 pt (espace très serré), sans caractère espace
      }
      page.drawText("Paragraphe de remplissage pour atteindre la longueur minimale du texte lisible.", { x: 50, y: 680, size: 9, font });
    });
    const { blocks } = await extractPdf(bytes);
    expect(blocks[0].text).toBe("Gestion de la relation client et accueil des clients en magasin");
  });

  it("ne coupe pas un mot écrit en deux morceaux collés", async () => {
    const bytes = await pdfWith((page, font) => {
      page.drawText("Dévelop", { x: 50, y: 700, size: 10, font });
      page.drawText("pement web et mobile pour une association étudiante, de la maquette à la mise en ligne.", {
        x: 50 + font.widthOfTextAtSize("Dévelop", 10),
        y: 700,
        size: 10,
        font,
      });
    });
    const { blocks } = await extractPdf(bytes);
    expect(blocks[0].text.startsWith("Développement web")).toBe(true);
  });
});

describe("CV en deux colonnes", () => {
  it("lit la colonne de gauche puis celle de droite, même si le PDF les alterne ligne par ligne", async () => {
    const left = ["CONTACT", "camille@exemple.fr", "06 00 00 00 00", "COMPÉTENCES", "Accueil client", "Encaissement"];
    const right = ["EXPÉRIENCE", "Équipière — Restaurant Fictif", "2024 – 2025", "Préparation des commandes et accueil des clients au comptoir.", "FORMATION", "Licence Information-Communication"];
    const bytes = await pdfWith((page, font) => {
      page.drawText("CAMILLE EXEMPLE", { x: 30, y: 800, size: 18, font });
      for (let i = 0; i < left.length; i++) {
        page.drawText(left[i], { x: 30, y: 760 - i * 16, size: 9, font });
        page.drawText(right[i], { x: 230, y: 760 - i * 16, size: 9, font });
      }
    });
    const { blocks } = await extractPdf(bytes);
    expect(blocks.map((b) => b.text)).toEqual(["CAMILLE EXEMPLE", ...left, ...right]);
  });

  it("ne réordonne pas un CV une colonne avec des dates alignées à droite", async () => {
    const rows = [
      ["Équipière polyvalente — Restaurant Fictif", "2024"],
      ["Accueil des clients et préparation des commandes au comptoir et en salle", ""],
      ["Vendeuse — Boutique Fictive", "2023"],
      ["Conseil client, encaissement et mise en rayon des nouveaux produits", ""],
      ["Animatrice — Centre de loisirs", "2022"],
      ["Encadrement d'un groupe de douze enfants pendant les vacances d'été", ""],
      ["Hôtesse d'accueil — Salon étudiant", "2021"],
      ["Orientation des visiteurs et distribution des programmes du salon", ""],
    ];
    const bytes = await pdfWith((page, font) => {
      rows.forEach(([text, date], i) => {
        page.drawText(text, { x: 50, y: 760 - i * 16, size: 10, font });
        if (date) page.drawText(date, { x: 520, y: 760 - i * 16, size: 10, font });
      });
    });
    const { blocks } = await extractPdf(bytes);
    // L'ordre du CV est conservé : chaque date reste juste après son intitulé
    const texts = blocks.map((b) => b.text);
    expect(texts.indexOf("2024")).toBe(texts.indexOf(rows[0][0]) + 1);
    expect(texts.indexOf("2022")).toBe(texts.indexOf(rows[4][0]) + 1);
  });
});

describe("chaque bloc n'apparaît qu'une fois", () => {
  it("retire un bloc rangé deux fois par l'IA (titres et dates en double)", async () => {
    const cv = makeCv({ experiences: 2, bullets: 1 });
    const first = cv.structure.sections[0].entries[0];
    const dup = structuredClone(cv.structure);
    dup.sections[0].entries[1].headerBlockIds.unshift(...first.headerBlockIds);
    dup.summaryBlockIds.push(first.headerBlockIds[0]);
    const fixed = completeStructure(cv.blocks, dup);
    const { bytes } = await renderResumePdf({ ...cv, structure: fixed });
    const { blocks } = await extractPdf(bytes);
    const title = cv.blocks.find((b) => b.id === first.headerBlockIds[0])!.text;
    expect(blocks.filter((b) => b.text.includes(title))).toHaveLength(1);
  });

  it("supprime une rubrique entièrement en double", () => {
    const cv = makeCv({ experiences: 1, bullets: 1 });
    const s = structuredClone(cv.structure);
    s.sections.push({ ...structuredClone(s.sections[0]), headingBlockId: s.sections[0].headingBlockId });
    expect(dedupeStructure(s).sections).toHaveLength(cv.structure.sections.length);
  });
});

describe("rubriques à leur place", () => {
  it("affiche « PROFIL » comme titre du résumé, pas dans les coordonnées", async () => {
    const cv = makeCv({ experiences: 1, bullets: 1 });
    cv.blocks.push({ id: "profil", text: "PROFIL" });
    const s = structuredClone(cv.structure);
    s.contactBlockIds.push("profil"); // erreur de l'IA observée sur un vrai CV
    const fixed = completeStructure(cv.blocks, s);
    expect(fixed.contactBlockIds).not.toContain("profil");
    expect(fixed.summaryHeadingBlockId).toBe("profil");
    const { bytes } = await renderResumePdf({ ...cv, structure: fixed });
    const texts = (await extractPdf(bytes)).blocks.map((b) => b.text);
    expect(texts.find((t) => t.includes("camille@exemple.fr"))).not.toContain("PROFIL");
    expect(texts.indexOf("PROFIL")).toBeLessThan(texts.findIndex((t) => t.startsWith("Développeuse web curieuse")));
  });

  it("met l'expérience avant les rubriques de la colonne de côté quand le CV passe sur une colonne", async () => {
    const cv = makeCv({ experiences: 2, bullets: 1, sidebar: true });
    // Ordre d'origine : la colonne de côté (compétences, langues) lue en premier
    const s = structuredClone(cv.structure);
    s.sections = [...s.sections.filter((x) => x.placement === "sidebar"), ...s.sections.filter((x) => x.placement === "main")];
    const { bytes } = await renderResumePdf({ ...cv, structure: s, style: { ...cv.style, layout: "single", sidebarColor: null } });
    const texts = (await extractPdf(bytes)).blocks.map((b) => b.text);
    expect(texts.indexOf("EXPÉRIENCE")).toBeLessThan(texts.indexOf("COMPÉTENCES"));
    expect(texts.indexOf("FORMATION")).toBeLessThan(texts.indexOf("LANGUES"));
  });
});

describe("Word à zones de texte", () => {
  it("détecte les zones de texte, pour recréer le CV au lieu de le faire déborder", async () => {
    const JSZip = (await import("jszip")).default;
    const { hasTextBoxes } = await import("@/lib/cv/docx");
    const { makeDocx } = await import("./helpers/fixtures");
    const plain = await makeDocx([{ text: "Camille Exemple" }, { text: "Expérience" }]);
    expect(await hasTextBoxes(plain)).toBe(false);
    const zip = await JSZip.loadAsync(plain);
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file("word/document.xml", xml.replace("<w:body>", '<w:body><w:p><w:r><w:pict><v:textbox><w:txbxContent><w:p><w:r><w:t>Compétences</w:t></w:r></w:p></w:txbxContent></v:textbox></w:pict></w:r></w:p>'));
    expect(await hasTextBoxes(await zip.generateAsync({ type: "uint8array" }))).toBe(true);
  });
});

describe("modèles : rien n'est perdu, en PDF comme en Word", async () => {
  const { applyTemplate, TEMPLATES } = await import("@/lib/export/templates");
  const { renderResumeDocx } = await import("@/lib/export/docx-template");
  const JSZip = (await import("jszip")).default;
  const pieces = (s: string) => s.replace(/^-\s*/, "").split(/\s+[|·•]\s+/).map((x) => x.trim()).filter(Boolean);
  // Casse ignorée : certains modèles écrivent le nom ou les titres en majuscules (mise en forme voulue)
  const flat = (s: string) => s.replace(/\s+/g, " ").toLowerCase();

  for (const id of TEMPLATES) {
    it(id, async () => {
      const cv = makeCv({ experiences: 3, bullets: 3, sidebar: true });
      cv.blocks.find((b) => b.text.startsWith("Janv. 2010"))!.text = "Paris | Janv. 2010 – Déc. 2010";
      const style = applyTemplate(cv.style, id);
      const pdfText = flat((await extractPdf((await renderResumePdf({ ...cv, style })).bytes)).blocks.map((b) => b.text).join(" "));
      const xml = await (await JSZip.loadAsync(await renderResumeDocx({ ...cv, style }))).file("word/document.xml")!.async("string");
      const docxText = flat(xml.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&apos;/g, "'").replace(/&amp;/g, "&"));
      for (const b of cv.blocks) {
        for (const p of pieces(b.text)) {
          expect(pdfText, `PDF ${id} : ${p}`).toContain(flat(p));
          expect(docxText, `Word ${id} : ${p}`).toContain(flat(p));
        }
      }
    });
  }
});

describe("modèle Précis : catégorie de compétences en gras", () => {
  it("sépare « Catégorie : valeurs » sans changer le texte", async () => {
    const { splitLabel } = await import("@/lib/cv/compose");
    expect(splitLabel("Langages : Python, SQL")).toEqual({ label: "Langages :", rest: "Python, SQL" });
    expect(splitLabel("Languages: English, French")).toEqual({ label: "Languages:", rest: "English, French" });
    expect(splitLabel("https://exemple.fr")).toBeNull();
    expect(splitLabel("Python, SQL, Git")).toBeNull();
  });
});
