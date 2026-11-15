import { NextResponse } from "next/server";
import { detectFormat, UserFacingError } from "@/lib/cv/validate-file";
import { extractDocx } from "@/lib/cv/docx";
import { extractPdf } from "@/lib/cv/pdf";
import { structureResume } from "@/lib/ai/structure";
import { errorResponse, rateLimit } from "@/lib/http";
import { durableLimit } from "@/lib/limits";
import type { ParsedResume } from "@/lib/cv/types";
import { completeStructure } from "@/lib/cv/compose";
import { safeAtsReadiness } from "@/lib/ats/readiness";

export const runtime = "nodejs";
export const maxDuration = 120;

// Import d'un CV : rien n'est stocké. Le fichier est lu en mémoire puis oublié ;
// le navigateur garde le fichier et le résultat pendant la session.
export async function POST(request: Request) {
  try {
    rateLimit(request, "parse", 20, 60 * 60 * 1000);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserFacingError("unsupported_file");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectFormat(bytes);
    // La lecture du CV appelle l'IA : limite durable par jour (compte, ou adresse IP sans compte)
    await durableLimit(request, "parse", { anon: 6, user: 30 });

    const extraction = format === "pdf" ? await extractPdf(bytes) : await extractDocx(bytes);
    // Lisibilité ATS du CV d'origine (sans IA), calculée en même temps que la lecture par l'IA
    const atsPromise = safeAtsReadiness(bytes, format, file.name);
    const { structure, style } = await structureResume({
      format,
      blocks: extraction.blocks,
      formatHints: extraction.formatHints,
      pdfBase64: format === "pdf" ? Buffer.from(bytes).toString("base64") : undefined,
    });

    const result: ParsedResume = {
      format,
      fileName: file.name,
      blocks: extraction.blocks,
      structure: completeStructure(extraction.blocks, structure),
      style,
      ats: await atsPromise,
    };
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
