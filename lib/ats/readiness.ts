import "server-only";
import type { SourceFormat } from "@/lib/cv/types";
import { UserFacingError } from "@/lib/cv/validate-file";
import { inspectResume } from "./inspect";
import { computeAtsScore, runChecks, unreadableReport, type AtsReadiness, type Check, type OfferKeyword } from "./checks";

// Lisibilité ATS d'un fichier, sans IA (donc gratuit) : sert à comparer le CV d'origine
// et le CV exporté. Le nom et le poids du fichier sont écartés : ils changent à l'export
// sans rien dire du contenu, et fausseraient la comparaison.

const IGNORED = new Set(["size", "file_name"]);

export async function atsReadiness(
  bytes: Uint8Array,
  format: SourceFormat,
  fileName: string,
  keywords: OfferKeyword[] | null = null,
): Promise<AtsReadiness> {
  let checks: Check[];
  let found: AtsReadiness["keywords"] = undefined;
  try {
    // Contrôle fait sur le texte RÉELLEMENT extrait du fichier (comme un logiciel de recrutement)
    const report = runChecks(await inspectResume(bytes, format, fileName), keywords);
    checks = report.checks;
    found = report.keywords ?? undefined;
  } catch (error) {
    if (error instanceof UserFacingError && (error.code === "scanned_pdf" || error.code === "empty_resume")) {
      checks = unreadableReport().checks;
    } else throw error;
  }
  checks = checks.filter((c) => !IGNORED.has(c.id));
  return { score: computeAtsScore(checks), checks, keywords: found };
}

/** Ne fait jamais échouer l'import ou l'export : le contrôle ATS est un bonus. */
export async function safeAtsReadiness(bytes: Uint8Array, format: SourceFormat, fileName: string, keywords: OfferKeyword[] | null = null) {
  try {
    return await atsReadiness(bytes, format, fileName, keywords);
  } catch {
    return null;
  }
}
