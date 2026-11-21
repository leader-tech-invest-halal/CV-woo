import { generateLetter, LetterInput } from "@/lib/ai/letter";
import { errorResponse, keepAliveJson, rateLimit } from "@/lib/http";
import { DAY, durableLimit } from "@/lib/limits";
import { getCurrentUser } from "@/lib/supabase/server";
import { UserFacingError } from "@/lib/cv/validate-file";

export const runtime = "nodejs";
export const maxDuration = 300;

// Lettre de motivation : un seul appel à l'IA par lettre, compté comme les adaptations, sur un mois :
// - avec un compte : 10 lettres sur 30 jours (2 par adaptation, sur 5 adaptations par mois :
//   la personne peut refaire une lettre une fois) ;
// - sans compte : 2 lettres sur 30 jours (celle de l'adaptation offerte, plus un nouvel essai).
// Le plafond de dépense du compte Anthropic reste le dernier filet. Rien n'est stocké.
const LETTER_LIMITS = { anon: 2, user: 10 };

export async function POST(request: Request) {
  try {
    rateLimit(request, "letter", 15, DAY * 1000);
    const body = LetterInput.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new UserFacingError("invalid_request");
    const ctx = await getCurrentUser();
    try {
      await durableLimit(request, "letter-month", LETTER_LIMITS, ctx, 30 * DAY);
    } catch (error) {
      // Limite atteinte : message propre aux lettres (créer un compte, ou attendre le mois suivant)
      if (error instanceof UserFacingError && error.code === "rate_limited") {
        throw new UserFacingError(ctx.user ? "letter_quota" : "letter_signup", 429);
      }
      throw error;
    }
    // Rédaction par l'IA : la connexion est maintenue ouverte pendant le traitement
    return keepAliveJson(() => generateLetter(body.data));
  } catch (error) {
    return errorResponse(error);
  }
}
