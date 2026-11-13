import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/cv/validate-file";

// Règle d'accès aux analyses :
// - sans compte : 1 adaptation offerte, puis création de compte obligatoire (e-mail + mot de passe) ;
// - avec compte : quota mensuel de la formule (bêta gratuite : 5 analyses / mois).
// L'essai sans compte est repéré par un cookie signé et par l'adresse IP. Ce n'est pas infaillible
// (navigation privée + autre réseau), mais suffisant pour inciter à créer un compte.

const TRIAL_COOKIE = "cvw_trial";
const anonymousIps = new Set<string>();

function signature(): string {
  // Secret de signature : APP_SECRET s'il existe, sinon dérivé de la clé Anthropic (jamais exposée),
  // pour n'avoir qu'un seul secret à saisir dans Vercel.
  const base = process.env.APP_SECRET || process.env.ANTHROPIC_API_KEY;
  if (!base) throw new Error("Aucun secret serveur configuré");
  const secret = process.env.APP_SECRET ? base : createHmac("sha256", "cv-woo-trial").update(base).digest("hex");
  return createHmac("sha256", secret).update("trial-used").digest("base64url");
}

function ipOf(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

async function trialUsed(request: Request): Promise<boolean> {
  const value = (await cookies()).get(TRIAL_COOKIE)?.value;
  if (value) {
    const expected = Buffer.from(signature());
    const got = Buffer.from(value);
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return process.env.NODE_ENV === "production" && anonymousIps.has(ipOf(request));
}

export type AccessContext = Awaited<ReturnType<typeof getCurrentUser>> & { remaining: number | null };

/** À appeler avant une analyse : refuse si l'essai gratuit est épuisé ou si le quota est atteint. */
export async function checkAnalyzeAccess(request: Request): Promise<AccessContext> {
  const ctx = await getCurrentUser();

  if (!ctx.user) {
    if (await trialUsed(request)) throw new UserFacingError("auth_required", 401);
    return { ...ctx, remaining: null };
  }

  const { data: plan } = await ctx.supabase.from("plans").select("analyses_quota").eq("tier", "free").maybeSingle();
  const quota = plan?.analyses_quota ?? 5;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count } = await ctx.supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id)
    .eq("kind", "analysis")
    .gte("created_at", monthStart.toISOString());
  const used = count ?? 0;
  if (used >= quota) throw new UserFacingError("quota_reached", 429);
  return { ...ctx, remaining: quota - used };
}

/** À appeler après une analyse réussie. */
export async function recordAnalyze(request: Request, ctx: AccessContext) {
  if (ctx.user) {
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
  anonymousIps.add(ipOf(request));
}
