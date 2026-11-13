import { NextResponse } from "next/server";
import { detectFormat, UserFacingError } from "@/lib/cv/validate-file";
import { inspectResume } from "@/lib/ats/inspect";
import { runChecks, unreadableReport } from "@/lib/ats/checks";
import { extractOfferKeywords } from "@/lib/ai/keywords";
import { errorResponse, rateLimit } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vérificateur ATS gratuit, sans inscription. Rien n'est stocké.
export async function POST(request: Request) {
  try {
    rateLimit(request, "ats", 30, 60 * 60 * 1000);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserFacingError("unsupported_file");
    const offer = String(form.get("offer") ?? "").trim().slice(0, 20_000);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const format = detectFormat(bytes);

    let inspection;
    try {
      inspection = await inspectResume(bytes, format, file.name);
    } catch (error) {
      // Un PDF scanné n'est pas une erreur ici : c'est le pire résultat possible pour un ATS
      if (error instanceof UserFacingError && (error.code === "scanned_pdf" || error.code === "empty_resume")) {
        return NextResponse.json(unreadableReport());
      }
      throw error;
    }

    let keywords = null;
    if (offer.length >= 100) {
      // L'option avec offre utilise l'IA : limite plus stricte
      rateLimit(request, "ats-ai", 15, 24 * 60 * 60 * 1000);
      keywords = await extractOfferKeywords(offer);
    }

    return NextResponse.json(runChecks(inspection, keywords));
  } catch (error) {
    return errorResponse(error);
  }
}
