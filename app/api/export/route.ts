import { z } from "zod";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { hasTextBoxes, rewriteDocx } from "@/lib/cv/docx";
import { detectFormat, UserFacingError } from "@/lib/cv/validate-file";
import { errorResponse, rateLimit } from "@/lib/http";
import type { ParsedResume } from "@/lib/cv/types";
import { applyTemplate, TEMPLATES } from "@/lib/export/templates";
import { LAYOUT_MODES } from "@/lib/export/layout";
import { safeAtsReadiness } from "@/lib/ats/readiness";
import { NEW_HEADLINE_ID, withNewHeadline } from "@/lib/cv/compose";

export const runtime = "nodejs";
export const maxDuration = 60;

const Payload = z.object({
  format: z.enum(["pdf", "docx"]),
  template: z.enum(TEMPLATES).default("original"),
  layout: z.enum(LAYOUT_MODES).default("compact"),
  resume: z.object({
    format: z.enum(["pdf", "docx"]),
    fileName: z.string().max(300),
    blocks: z.array(z.object({ id: z.string().max(20), text: z.string().max(2000) })).max(800),
    structure: z.any(),
    style: z.any(),
  }),
  accepted: z.record(z.string().max(20), z.string().max(3000)),
});

/**
 * Export du CV optimisé.
 * - CV d'origine en Word + export Word : le fichier d'origine est modifié sur place (design intact).
 * - Sinon : le CV est recomposé avec le style détecté (couleurs, police, colonnes).
 */
export async function POST(request: Request) {
  try {
    rateLimit(request, "export", 120, 60 * 60 * 1000);
    const form = await request.formData();
    const parsed = Payload.safeParse(JSON.parse(String(form.get("payload") ?? "null")));
    if (!parsed.success) throw new UserFacingError("invalid_request");
    const { format, accepted, template, layout } = parsed.data;
    const original = parsed.data.resume as ParsedResume;
    const resume = { ...original, style: applyTemplate(original.style, template) };

    // On n'accepte que des réécritures de blocs qui existent
    const known = new Set(resume.blocks.map((b) => b.id));
    // Le titre créé sous le nom est le seul bloc nouveau autorisé (une ligne courte)
    if (!resume.structure.headlineBlockId) known.add(NEW_HEADLINE_ID);
    const safeAccepted = Object.fromEntries(
      Object.entries(accepted)
        .filter(([id]) => known.has(id))
        .map(([id, text]) => [id, id === NEW_HEADLINE_ID ? text.replace(/\s+/g, " ").trim().slice(0, 120) : text]),
    );
    const withHeadline = withNewHeadline(resume, safeAccepted);

    const base = resume.fileName.replace(/\.(pdf|docx)$/i, "") || "cv";
    let body: Uint8Array;
    let type: string;
    let pages: number | null = null;

    // Word d'origine + design d'origine : on modifie le fichier lui-même (mise en page identique)
    // (Depuis l'historique, le fichier d'origine n'est pas conservé : le Word est alors recomposé.)
    const file = form.get("file");
    let sourceDocx: Uint8Array | null = null;
    // Notice affichée dans l'aperçu quand le fichier n'a pas pu être modifié sur place
    let notice: string | null = null;
    if (format === "docx" && resume.format === "docx" && template === "original" && file instanceof File) {
      sourceDocx = new Uint8Array(await file.arrayBuffer());
      if (detectFormat(sourceDocx) !== "docx") throw new UserFacingError("unsupported_file");
      // Zones de texte de taille fixe (CV « deux colonnes » faits dans Word, modèles Canva…) :
      // un texte réécrit plus long y déborde et chevauche la zone voisine. On recrée alors le CV
      // avec ses couleurs et sa police, et on le dit à la personne.
      if (await hasTextBoxes(sourceDocx)) {
        sourceDocx = null;
        notice = "docx_textboxes";
      }
    }
    if (sourceDocx) {
      const bytes = sourceDocx;
      body = await rewriteDocx(bytes, safeAccepted, {
        afterBlockIds: [resume.structure.nameBlockId, ...(resume.structure.nameExtraBlockIds ?? [])].filter(Boolean) as string[],
        text: resume.structure.headlineBlockId ? undefined : safeAccepted[NEW_HEADLINE_ID],
      });
      type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      // Le PDF décide du réglage de mise en page ; le Word reprend exactement le même
      const pdf = await renderResumePdf({ ...withHeadline, accepted: safeAccepted }, layout);
      pages = pdf.pages;
      if (format === "docx") {
        body = await renderResumeDocx({ ...withHeadline, accepted: safeAccepted }, pdf.level);
        type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else {
        body = pdf.bytes;
        type = "application/pdf";
      }
    }

    const filename = `${base}-cv-woo.${format}`;
    // Lisibilité ATS du fichier exporté, pour la comparer à celle du CV d'origine
    const ats = await safeAtsReadiness(body, format, filename);
    return new Response(Buffer.from(body), {
      headers: {
        "content-type": type,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
        ...(pages ? { "x-cv-pages": String(pages) } : {}),
        ...(ats ? { "x-cv-ats": encodeURIComponent(JSON.stringify(ats)) } : {}),
        ...(notice ? { "x-cv-notice": notice } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
