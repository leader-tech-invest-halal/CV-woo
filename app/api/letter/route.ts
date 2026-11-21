import { generateLetter, LetterInput } from "@/lib/ai/letter";
import { errorResponse, keepAliveJson, rateLimit } from "@/lib/http";
import { durableLimit } from "@/lib/limits";
import { UserFacingError } from "@/lib/cv/validate-file";

export const runtime = "nodejs";
export const maxDuration = 300;

// Lettre de motivation : un seul appel à l'IA par lettre. Comptée dans les limites durables
// de la bêta (par compte, ou par adresse IP sans compte), comme la lecture et l'analyse ;
// le plafond de dépense du compte Anthropic reste le dernier filet. Rien n'est stocké.
export async function POST(request: Request) {
  try {
    rateLimit(request, "letter", 15, 24 * 60 * 60 * 1000);
    const body = LetterInput.safeParse(await request.json().catch(() => null));
    if (!body.success) throw new UserFacingError("invalid_request");
    await durableLimit(request, "letter", { anon: 2, user: 10 });
    // Rédaction par l'IA : la connexion est maintenue ouverte pendant le traitement
    return keepAliveJson(() => generateLetter(body.data));
  } catch (error) {
    return errorResponse(error);
  }
}
