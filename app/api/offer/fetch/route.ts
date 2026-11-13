import { NextResponse } from "next/server";
import { fetchOfferText } from "@/lib/offer/fetch";
import { errorResponse, rateLimit } from "@/lib/http";
import { UserFacingError } from "@/lib/cv/validate-file";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    rateLimit(request, "offer", 30, 60 * 60 * 1000);
    const { url } = (await request.json().catch(() => ({}))) as { url?: unknown };
    if (typeof url !== "string" || url.length > 2000) throw new UserFacingError("invalid_url");
    return NextResponse.json(await fetchOfferText(url.trim()));
  } catch (error) {
    return errorResponse(error);
  }
}
