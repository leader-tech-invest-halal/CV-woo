import "server-only";
import { NextResponse } from "next/server";
import { UserFacingError } from "@/lib/cv/validate-file";

// Limite simple par adresse IP, en mémoire : première barrière rapide contre les rafales.
// Elle repart à zéro sur chaque serveur ; les limites durables sont dans lib/limits.ts.
const hits = new Map<string, number[]>();

export function rateLimit(request: Request, bucket: string, max: number, windowMs: number) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new UserFacingError("rate_limited", 429);
  recent.push(now);
  hits.set(key, recent);
}

export function errorResponse(error: unknown) {
  if (error instanceof UserFacingError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "server_error" }, { status: 500 });
}
