import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { renderBalanced, MAX_GAP } from "@/lib/export/balance";
import { columnGap } from "@/lib/export/measure";
import { applyTemplate } from "@/lib/export/templates";
import type { ResumeStructure } from "@/lib/cv/types";
import { makeCv } from "./helpers/cv";
import { renderPageAsImage } from "unpdf";

// Équilibrage automatique de la page (sans IA), mesuré dans le PDF réel, sur le modèle Moderne
// (deux colonnes). Trois CV fictifs : court, moyen, très long. Les mesures avant / après sont
// affichées ; les aperçus sont écrits dans ../apercu-modeles/ quand APERCU=1.

const KEYWORDS = ["React", "revue de code", "accessibilité"];

function cv(experiences: number, bullets: number) {
  const base = makeCv({ experiences, bullets });
  const add = (text: string) => {
    const id = `x${base.blocks.length}`;
    base.blocks.push({ id, text });
    return id;
  };
  // Rubriques courtes supplémentaires, rangées dans la colonne principale par défaut
  const extra: ResumeStructure["sections"] = [
    {
      headingBlockId: add("CERTIFICATIONS"),
      heading: "Certifications",
      kind: "certifications",
      placement: "main",
      entries: [{ headerBlockIds: [], bulletBlockIds: [add("Opquast — Qualité web"), add("Google — Analytics")] }],
    },
    {
      headingBlockId: add("CENTRES D'INTÉRÊT"),
      heading: "Centres d'intérêt",
      kind: "other",
      placement: "main",
      entries: [{ headerBlockIds: [], bulletBlockIds: [add("Course à pied"), add("Photographie")] }],
    },
  ];
  base.structure.sections.push(...extra);
  return { ...base, style: applyTemplate(base.style, "moderne") };
}

const CASES = [
  { name: "court", doc: cv(1, 2) },
  { name: "moyen", doc: cv(3, 4) },
  { name: "très long", doc: cv(8, 6) },
];

describe("équilibrage automatique de la page (modèle Moderne)", () => {
  it.each(CASES)("CV $name", async ({ name, doc }) => {
    const { pdf, report } = await renderBalanced(doc, "compact", KEYWORDS);
    const fmt = (m: typeof report.before) => `latérale ${m.side} % · principale ${m.main} % · ${m.pages} page(s)${m.overflow ? ` (+${m.overflow} %)` : ""}`;
    console.log(
      `\n[${name}] AVANT : ${fmt(report.before)}\n[${name}] APRÈS : ${fmt(report.after)}` +
        `\n[${name}] rubriques déplacées : ${report.moved.map((x) => `${x.heading} → ${x.to === "sidebar" ? "latérale" : "principale"}`).join(", ") || "aucune"}` +
        `\n[${name}] puces masquées : ${report.hidden.length} · essais : ${report.attempts}`,
    );
    if (process.env.APERCU) fs.writeFileSync(`../apercu-modeles/equilibre-${name.replace(" ", "-")}.png`, await renderPageAsImage(new Uint8Array(pdf.bytes), 1, { canvasImport: () => import("@napi-rs/canvas"), width: 900 }));

    // Jamais pire qu'avant, et au plus 5 essais
    expect(report.attempts).toBeLessThanOrEqual(5);
    expect(report.after.pages).toBeLessThanOrEqual(report.before.pages);
    if (report.before.pages === 1 && report.after.pages === 1) expect(columnGap(report.after)).toBeLessThanOrEqual(Math.max(MAX_GAP, columnGap(report.before)));
    // Le très long CV déborde moins (puces les moins utiles masquées) ; s’il dépasse encore,
    // la personne en est informée dans l’aperçu
    if (name === "très long") {
      expect(report.after.overflow).toBeLessThan(report.before.overflow);
      expect(report.hidden.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it("en mode Détaillé, aucune puce n'est masquée (deux pages permises)", async () => {
    const { report } = await renderBalanced(CASES[2].doc, "detailed", KEYWORDS);
    expect(report.hidden).toEqual([]);
  }, 120_000);

  it("chaque expérience garde au moins 2 puces", async () => {
    const { doc } = await renderBalanced(CASES[2].doc, "compact", KEYWORDS);
    for (const e of doc.structure.sections.find((s) => s.kind === "experience")!.entries) expect(e.bulletBlockIds.length).toBeGreaterThanOrEqual(2);
  }, 120_000);
});
