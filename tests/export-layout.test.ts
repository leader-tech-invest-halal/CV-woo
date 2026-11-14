import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { extractPdf } from "@/lib/cv/pdf";
import { DENSITIES, MIN_BODY_SIZE } from "@/lib/export/layout";
import { DEFAULT_STYLE, type Block, type ResumeStructure, type ResumeStyle } from "@/lib/cv/types";
import { normalize } from "@/lib/ai/guardrails";

// Mise en page de l'export : une page quand c'est possible, sans jamais perdre de contenu.
// CV fictifs fabriqués à la volée (aucune donnée réelle).

function makeCv({ experiences, bullets, sidebar = false }: { experiences: number; bullets: number; sidebar?: boolean }) {
  const blocks: Block[] = [];
  const add = (text: string) => {
    const id = `b${blocks.length}`;
    blocks.push({ id, text });
    return id;
  };
  const name = add("Camille Exemple");
  const headline = add("Développeuse web");
  const contacts = [add("camille@exemple.fr"), add("06 00 00 00 00"), add("Lyon")];
  const summary = [add("Développeuse web curieuse et rigoureuse, je conçois des applications accessibles et rapides avec les équipes produit.")];
  const place = sidebar ? ("sidebar" as const) : ("main" as const);
  const sections: ResumeStructure["sections"] = [
    {
      headingBlockId: add("EXPÉRIENCE"),
      heading: "Expérience",
      kind: "experience",
      placement: "main",
      entries: Array.from({ length: experiences }, (_, i) => ({
        headerBlockIds: [add(`Développeuse web — Société Fictive ${i + 1}`), add(`Janv. 20${10 + i} – Déc. 20${10 + i} · Lyon`)],
        bulletBlockIds: Array.from({ length: bullets }, (_, j) =>
          add(`- Mission ${i + 1}.${j + 1} : développement d'une fonctionnalité React avec l'équipe produit et revue de code.`),
        ),
      })),
    },
    {
      headingBlockId: add("FORMATION"),
      heading: "Formation",
      kind: "education",
      placement: "main",
      entries: [
        { headerBlockIds: [add("Licence Informatique — Université Fictive"), add("2020 – 2023")], bulletBlockIds: [] },
        { headerBlockIds: [add("Certification Accessibilité numérique"), add("2023")], bulletBlockIds: [] },
      ],
    },
    {
      headingBlockId: add("COMPÉTENCES"),
      heading: "Compétences",
      kind: "skills",
      placement: place,
      entries: [{ headerBlockIds: [], bulletBlockIds: ["JavaScript, TypeScript, React", "HTML, CSS, Figma", "Git, tests automatisés"].map(add) }],
    },
    {
      headingBlockId: add("LANGUES"),
      heading: "Langues",
      kind: "languages",
      placement: place,
      entries: [{ headerBlockIds: [], bulletBlockIds: ["Français : langue maternelle", "Anglais : B2"].map(add) }],
    },
  ];
  const structure: ResumeStructure = {
    language: "fr",
    nameBlockId: name,
    headlineBlockId: headline,
    contactBlockIds: contacts,
    contactHeadingBlockId: null,
    summaryBlockIds: summary,
    sections,
  };
  const style: ResumeStyle = sidebar
    ? { ...DEFAULT_STYLE, layout: "sidebar-left", sidebarColor: "#0f3d33" }
    : DEFAULT_STYLE;
  return { blocks, structure, style, accepted: {} as Record<string, string> };
}

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
