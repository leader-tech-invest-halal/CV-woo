import { NextResponse } from "next/server";
import { releaseTrialCookie } from "@/lib/access";
import { rateLimit } from "@/lib/http";

export const runtime = "nodejs";

// Après une analyse échouée sans compte, l'essai gratuit a été rendu dans la base ; cette route
// efface aussi le cookie d'essai, seulement avec le jeton signé renvoyé par l'analyse échouée
// (même adresse, moins de 15 minutes). Impossible donc de s'en servir après une analyse réussie.
export async function POST(request: Request) {
  rateLimit(request, "release", 10, 60 * 60 * 1000);
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const ok = typeof body?.token === "string" && body.token.length < 200 && (await releaseTrialCookie(request, body.token));
  return NextResponse.json({ ok });
}
