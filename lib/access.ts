import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/cv/validate-file";
import { clientIp, ipKey, serverSecret } from "@/lib/limits";

// Règle d'accès aux analyses :
// - sans compte : 1 adaptation offerte, puis création de compte obligatoire (e-mail + mot de passe) ;
// - avec compte : quota mensuel de la formule (bêta gratuite : 5 analyses / mois).
// L'essai sans compte est repéré par un cookie signé ET par une empreinte de l'adresse IP gardée
// 30 jours dans la base (effacer ses cookies ne suffit plus). Avec un compte, l'analyse est
// réservée sur le quota avant l'appel à l'IA, de façon atomique (claim_analysis).

const TRIAL_COOKIE = "cvw_trial";
const TRIAL_DAYS = 30;
const anonymousIps = new Set<string>();

function signature(): string {
  return createHmac("sha256", serverSecret()).update("trial-used").digest("base64url");
}

async function trialCookieUsed(): Promise<boolean> {
  const value = (await cookies()).get(TRIAL_COOKIE)?.value;
  if (!value) return false;
  const expected = Buffer.from(signature());
  const got = Buffer.from(value);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

type Supabase = Awaited<ReturnType<typeof getCurrentUser>>["supabase"];

/** Adaptations utilisées ce mois-ci et quota de la formule (bêta gratuite : 5). Administrateur : illimité. */
export async function monthlyUsage(
  supabase: Supabase,
  userId: string,
): Promise<{ used: number; quota: number; unlimited: boolean }> {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const unlimited = profile?.role === "admin";
  const { data: plan } = await supabase.from("plans").select("analyses_quota").eq("tier", "free").maybeSingle();
  const quota = plan?.analyses_quota ?? 5;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "analysis")
    .gte("created_at", monthStart.toISOString());
  return { used: count ?? 0, quota, unlimited };
}

export type AccessContext = Awaited<ReturnType<typeof getCurrentUser>> & {
  remaining: number | null;
  /** L'analyse est déjà comptée (réservée avant l'appel à l'IA). */
  claimed: boolean;
};

/** À appeler avant une analyse : refuse si l'essai gratuit est épuisé ou si le quota est atteint. */
export async function checkAnalyzeAccess(request: Request): Promise<AccessContext> {
  const ctx = await getCurrentUser();

  if (!ctx.user) {
    if (await trialCookieUsed()) throw new UserFacingError("auth_required", 401);
    if (process.env.NODE_ENV === "production" && anonymousIps.has(clientIp(request))) throw new UserFacingError("auth_required", 401);
    // Essai réservé pour cette adresse pendant 30 jours (compté avant l'appel à l'IA)
    const { data, error } = await ctx.supabase.rpc("rate_hit", {
      p_bucket: "trial",
      p_key: ipKey(request),
      p_max: 1,
      p_window_seconds: TRIAL_DAYS * 24 * 60 * 60,
    });
    if (error) console.error("Essai gratuit : vérification durable indisponible", error.code);
    else if (data === false) throw new UserFacingError("auth_required", 401);
    return { ...ctx, remaining: null, claimed: !error };
  }

  // Réservation atomique sur le quota (plusieurs analyses lancées en même temps ne passent plus toutes)
  const { data, error } = await ctx.supabase.rpc("claim_analysis");
  if (!error && typeof data === "number") {
    if (data < 0) throw new UserFacingError("quota_reached", 429);
    // 999 : compte administrateur, sans limite (aucun compteur affiché)
    return { ...ctx, remaining: data >= 999 ? null : data + 1, claimed: true };
  }
  // Fonction indisponible : ancienne vérification (compte après réussite)
  if (error) console.error("Quota : réservation indisponible", error.code);
  const { used, quota, unlimited } = await monthlyUsage(ctx.supabase, ctx.user.id);
  if (unlimited) return { ...ctx, remaining: null, claimed: false };
  if (used >= quota) throw new UserFacingError("quota_reached", 429);
  return { ...ctx, remaining: quota - used, claimed: false };
}

/** À appeler après une analyse réussie. */
export async function recordAnalyze(request: Request, ctx: AccessContext) {
  if (ctx.user) {
    if (ctx.claimed) return;
    const { error } = await ctx.supabase.from("usage_events").insert({ user_id: ctx.user.id, kind: "analysis" });
    if (error) console.error("Enregistrement de l'usage impossible", error.message);
    return;
  }
  (await cookies()).set(TRIAL_COOKIE, signature(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  anonymousIps.add(clientIp(request));
}
