import { z } from "zod";
import { renderResumePdf } from "@/lib/export/pdf";
import { renderResumeDocx } from "@/lib/export/docx-template";
import { rewriteDocx } from "@/lib/cv/docx";
import { detectFormat, UserFacingError } from "@/lib/cv/validate-file";
import { errorResponse, rateLimit } from "@/lib/http";
import type { ParsedResume } from "@/lib/cv/types";
import { applyTemplate, TEMPLATES } from "@/lib/export/templates";

export const runtime = "nodejs";
export const maxDuration = 60;

const Payload = z.object({
  format: z.enum(["pdf", "docx"]),
  template: z.enum(TEMPLATES).default("original"),
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
    const { format, accepted, template } = parsed.data;
    const original = parsed.data.resume as ParsedResume;
    const resume = { ...original, style: applyTemplate(original.style, template) };

    // On n'accepte que des réécritures de blocs qui existent
    const known = new Set(resume.blocks.map((b) => b.id));
    const safeAccepted = Object.fromEntries(Object.entries(accepted).filter(([id]) => known.has(id)));

    const base = resume.fileName.replace(/\.(pdf|docx)$/i, "") || "cv";
    let body: Uint8Array;
    let type: string;

    // Word d'origine + design d'origine : on modifie le fichier lui-même (mise en page identique)
    if (format === "docx" && resume.format === "docx" && template === "original") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new UserFacingError("invalid_request");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (detectFormat(bytes) !== "docx") throw new UserFacingError("unsupported_file");
      body = await rewriteDocx(bytes, safeAccepted);
      type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else if (format === "docx") {
      body = await renderResumeDocx({ ...resume, accepted: safeAccepted });
      type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    } else {
      body = await renderResumePdf({ ...resume, accepted: safeAccepted });
      type = "application/pdf";
    }

    const filename = `${base}-cv-woo.${format}`;
    return new Response(Buffer.from(body), {
      headers: {
        "content-type": type,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
