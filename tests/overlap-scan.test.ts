import { describe, expect, it } from "vitest";
import { renderResumePdf } from "@/lib/export/pdf";
import { applyTemplate, TEMPLATES } from "@/lib/export/templates";
import { findOverlaps } from "./helpers/overlap";
import { makeCv } from "./helpers/cv";

// Balayage : de nombreux CV de tailles différentes, tous modèles et mises en page.
// Aucun texte ne doit en chevaucher un autre, quelle que soit la position des sauts de page.

describe("aucun chevauchement de texte dans les PDF générés", () => {
  for (const sidebar of [false, true]) {
    for (const template of TEMPLATES) {
      it(`${template}${sidebar ? " (2 colonnes)" : ""}`, { timeout: 400_000 }, async () => {
        const problems: string[] = [];
        for (let experiences = 2; experiences <= 10; experiences++) {
          for (const bullets of [2, 5]) {
            const cv = makeCv({ experiences, bullets, sidebar });
            const style = applyTemplate(cv.style, template);
            for (const layout of ["compact", "detailed"] as const) {
              const { bytes } = await renderResumePdf({ ...cv, style }, layout);
              const o = await findOverlaps(bytes);
              if (o.length) problems.push(`${experiences} exp × ${bullets} points, ${layout} : ${JSON.stringify(o[0])}`);
            }
          }
        }
        expect(problems).toEqual([]);
      });
    }
  }
});
