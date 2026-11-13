import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { UserFacingError } from "@/lib/cv/validate-file";

// Client Claude : utilisé uniquement côté serveur, la clé n'est jamais envoyée au navigateur.
let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new UserFacingError("ai_not_configured", 503);
  client ??= new Anthropic({ maxRetries: 3, timeout: 120_000 });
  return client;
}

export const MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST || "claude-haiku-5-5";
export const MODEL_SMART = process.env.ANTHROPIC_MODEL_SMART || "claude-sonnet-5-5";

/** Traduit les erreurs de l'API en codes affichables à l'utilisateur. */
export function toUserError(error: unknown): never {
  if (error instanceof UserFacingError) throw error;
  if (error instanceof Anthropic.AuthenticationError) throw new UserFacingError("ai_not_configured", 503);
  if (error instanceof Anthropic.RateLimitError) throw new UserFacingError("ai_busy", 429);
  if (error instanceof Anthropic.BadRequestError && /credit|billing/i.test(error.message)) {
    throw new UserFacingError("ai_budget", 402);
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Erreur API Claude", error.status, error.message);
    throw new UserFacingError("ai_failed", 502);
  }
  throw error;
}

export function logUsage(step: string, model: string, usage: { input_tokens: number; output_tokens: number }) {
  // Journal simple en attendant la table ai_calls (étape 10, avec les comptes utilisateurs)
  console.info(`[ia] ${step} ${model} entrée=${usage.input_tokens} sortie=${usage.output_tokens}`);
}
