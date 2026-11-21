import { analyze, AnalyzeInput } from "@/lib/ai/analyze";
import { errorResponse, keepAliveJson, rateLimit } from "@/lib/http";
import { checkAnalyzeAccess, recordAnalyze, refundAnalyze } from "@/lib/access";
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
    // Sans compte, l'essai est déjà réservé pour cette adresse avant l'appel à l'IA : le cookie
    // d'essai est posé maintenant, car la réponse part ensuite au fil de l'analyse (voir plus bas).
    if (!access.user) await recordAnalyze(request, access);

    // Analyse par l'IA (souvent plus d'une minute) : la connexion est maintenue ouverte
    return keepAliveJson(async () => {
      try {
        const result = await analyze(body.data);
        if (access.user) await recordAnalyze(request, access);
        return {
          ...result,
          remaining: access.remaining === null ? null : access.remaining - 1,
          signedIn: !!access.user,
        };
      } catch (error) {
        // Échec : l'essai gratuit ou l'adaptation du mois est rendu (la personne peut réessayer)
        const release = await refundAnalyze(request, access);
        if (!(error instanceof UserFacingError)) console.error(error);
        return { error: error instanceof UserFacingError ? error.code : "server_error", ...(release ? { release } : {}) };
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
