import { NextResponse } from "next/server";
import { enrich, EnrichInput } from "@/lib/ai/enrich";
import { errorResponse, rateLimit } from "@/lib/http";
import { durableLimit } from "@/lib/limits";
import { UserFacingError } from "@/lib/cv/validate-file";

export const runtime = "nodejs";
export const maxDuration = 120;

// Étape « Enrichir mon profil » : intègre les compétences confirmées par la personne.
// Ne consomme pas d'adaptation (elle complète l'analyse déjà faite). Rien n'est stocké.
export async function POST(request: Request) {
  try {
    rateLimit(request, "enrich", 15, 24 * 60 * 60 * 1000);
    const body = EnrichInput.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new UserFacingError("invalid_request");
    await durableLimit(request, "enrich", { anon: 3, user: 20 });
    return NextResponse.json(await enrich(body.data));
  } catch (error) {
    return errorResponse(error);
  }
}
