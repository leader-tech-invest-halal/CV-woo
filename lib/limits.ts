import "server-only";
import { createHmac } from "node:crypto";
import { getCurrentUser } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/cv/validate-file";
import { networkId } from "@/lib/network";

// Limites d'usage durables, partagées par tous les serveurs (table Supabase via rate_hit()).
// Elles protègent le budget IA contre les scripts : la limite en mémoire (lib/http.ts) reste
// une première barrière rapide, mais elle repart à zéro sur chaque serveur.
// Clé : le compte si la personne est connectée, sinon une empreinte de l'adresse IP
// (jamais l'adresse elle-même).

export const DAY = 24 * 60 * 60;

/** Secret serveur : APP_SECRET s'il existe, sinon dérivé de la clé Anthropic (jamais exposée). */
export function serverSecret(): string {
  const base = process.env.APP_SECRET || process.env.ANTHROPIC_API_KEY;
  if (!base) throw new Error("Aucun secret serveur configuré");
  return process.env.APP_SECRET ? base : createHmac("sha256", "cv-woo-trial").update(base).digest("hex");
}

/**
 * Connexion du visiteur : l’adresse IPv4, ou le début fixe (préfixe /64) d’une adresse IPv6,
 * dont la fin change souvent (voir lib/network.ts).
 */
export function clientIp(request: Request): string {
  // Sur Vercel, x-real-ip et x-forwarded-for sont fixés par la plateforme (non falsifiables)
  const raw = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  return networkId(raw);
}

/** Empreinte anonyme et stable d'une adresse IP. */
export function ipKey(request: Request): string {
  return "ip:" + createHmac("sha256", serverSecret()).update(clientIp(request)).digest("base64url").slice(0, 32);
}

type Ctx = Awaited<ReturnType<typeof getCurrentUser>>;

/**
 * Compte une action et refuse au-delà de la limite (par jour par défaut).
 * Si la base est injoignable, on laisse passer (le plafond de dépense Anthropic reste le dernier filet).
 */
export async function durableLimit(
  request: Request,
  bucket: string,
  max: { anon: number; user: number },
  ctx?: Ctx,
  windowSeconds = DAY,
): Promise<Ctx> {
  const c = ctx ?? (await getCurrentUser());
  const key = c.user ? `u:${c.user.id}` : ipKey(request);
  const { data, error } = await c.supabase.rpc("rate_hit", {
    p_bucket: bucket,
    p_key: key,
    p_max: c.user ? max.user : max.anon,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Limite durable indisponible", bucket, error.code);
    return c;
  }
  if (data === false) throw new UserFacingError("rate_limited", 429);
  return c;
}
