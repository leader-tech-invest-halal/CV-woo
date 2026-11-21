import { z } from "zod";
import { renderLetterPdf } from "@/lib/export/letter-pdf";
import { applyTemplate, TEMPLATES } from "@/lib/export/templates";
import { errorResponse, rateLimit } from "@/lib/http";
import { DEFAULT_STYLE, type ResumeStyle } from "@/lib/cv/types";
import { UserFacingError } from "@/lib/cv/validate-file";

export const runtime = "nodejs";
export const maxDuration = 60;

// PDF de la lettre de motivation (texte relu et modifié par la personne), dans le style du
// modèle de CV choisi. Aucun appel à l'IA, rien n'est stocké.
const Payload = z.object({
  template: z.enum(TEMPLATES).default("original"),
  style: z.any().optional(),
  letter: z.object({
    sender: z.array(z.string().max(300)).max(8),
    recipient: z.string().max(600),
    placeDate: z.string().max(200),
    subject: z.string().max(300),
    body: z.string().max(8000),
    signature: z.string().max(200),
  }),
});

export async function POST(request: Request) {
  try {
    rateLimit(request, "letter-pdf", 120, 60 * 60 * 1000);
    const parsed = Payload.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new UserFacingError("invalid_request");
    const style = applyTemplate({ ...DEFAULT_STYLE, ...((parsed.data.style ?? {}) as Partial<ResumeStyle>) }, parsed.data.template);
    const { bytes, pages } = await renderLetterPdf(parsed.data.letter, style);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename*=UTF-8''lettre-de-motivation.pdf",
        "cache-control": "no-store",
        "x-cv-pages": String(pages),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
