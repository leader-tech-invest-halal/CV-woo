import "server-only";
import { NextResponse } from "next/server";
import { UserFacingError } from "@/lib/cv/validate-file";
import { networkId } from "@/lib/network";

// Limite simple par adresse IP, en mémoire : première barrière rapide contre les rafales.
// Elle repart à zéro sur chaque serveur ; les limites durables sont dans lib/limits.ts.
const hits = new Map<string, number[]>();

export function rateLimit(request: Request, bucket: string, max: number, windowMs: number) {
  // Même identifiant de connexion que les limites durables (préfixe fixe d’une adresse IPv6)
  const ip = networkId(request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
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

/**
 * Réponse JSON pour les traitements longs (lecture du CV, analyse par l'IA).
 * Un espace est envoyé tout de suite puis toutes les 5 secondes, jusqu'au résultat : sur réseau
 * mobile, certains opérateurs coupent une connexion restée muette une minute environ, et le
 * téléphone affichait « Connexion impossible ». Les espaces avant le JSON sont ignorés à la lecture.
 * Une erreur pendant le traitement est renvoyée dans le corps ({ error }), avec le statut 200.
 */
export function keepAliveJson(work: () => Promise<unknown>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(" "));
      const timer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          // connexion déjà fermée par le navigateur
        }
      }, 5000);
      let body: unknown;
      try {
        body = await work();
      } catch (error) {
        if (!(error instanceof UserFacingError)) console.error(error);
        body = { error: error instanceof UserFacingError ? error.code : "server_error" };
      } finally {
        clearInterval(timer);
      }
      try {
        controller.enqueue(encoder.encode(JSON.stringify(body)));
        controller.close();
      } catch {
        // connexion déjà fermée par le navigateur
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}
