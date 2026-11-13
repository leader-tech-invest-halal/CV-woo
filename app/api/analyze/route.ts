import { NextResponse } from "next/server";
import { analyze, AnalyzeInput } from "@/lib/ai/analyze";
import { errorResponse, rateLimit } from "@/lib/http";
import { checkAnalyzeAccess, recordAnalyze } from "@/lib/access";
import { UserFacingError } from "@/lib/cv/validate-file";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    rateLimit(request, "analyze", 20, 24 * 60 * 60 * 1000);
    const body = AnalyzeInput.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      const offerTooShort = body.error.issues.some((i) => i.path[0] === "offerText");
      throw new UserFacingError(offerTooShort ? "offer_too_short" : "invalid_request");
    }
    // Essai gratuit sans compte, puis compte obligatoire et quota mensuel
    const access = await checkAnalyzeAccess(request);
    const result = await analyze(body.data);
    await recordAnalyze(request, access);
    return NextResponse.json({
      ...result,
      remaining: access.remaining === null ? null : access.remaining - 1,
      signedIn: !!access.user,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
