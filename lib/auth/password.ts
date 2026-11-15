// Règles des mots de passe CV Woo (inscription et nouveau mot de passe).
// Elles sont vérifiées dans le navigateur pour guider la personne ; Supabase doit appliquer
// la même longueur minimale et les mêmes exigences côté serveur (réglage du tableau de bord).

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72; // limite de l'algorithme bcrypt utilisé par Supabase

// Mots de passe et morceaux les plus utilisés (France et international) : refusés tels quels
const COMMON = [
  "password", "motdepasse", "azerty", "qwerty", "123456", "1234567890", "000000", "111111", "abc123",
  "iloveyou", "jetaime", "soleil", "doudou", "loulou", "chouchou", "marseille", "paris", "football",
  "bonjour", "admin", "welcome", "bienvenue", "monkey", "dragon", "letmein", "sunshine", "princess",
  "cvwoo", "cv-woo", "secret", "azertyuiop", "qwertyuiop", "nicolas", "camille", "julien", "thomas",
];

export type PasswordIssue = "too_short" | "too_long" | "needs_letter" | "needs_digit" | "too_common" | "contains_email" | "repetitive";

/** Problèmes d'un mot de passe ; liste vide = accepté. */
export function passwordIssues(password: string, email = ""): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const lower = password.toLowerCase();
  if (password.length < PASSWORD_MIN) issues.push("too_short");
  if (password.length > PASSWORD_MAX) issues.push("too_long");
  if (!/\p{L}/u.test(password)) issues.push("needs_letter");
  if (!/\d/.test(password)) issues.push("needs_digit");
  // Mot courant à peine modifié : « Azerty2024! », « motdepasse123 »…
  const core = lower.replace(/[^a-z]/g, "");
  if (COMMON.some((w) => core === w.replace(/[^a-z]/g, "") && core.length > 0) || COMMON.includes(lower)) issues.push("too_common");
  const local = email.toLowerCase().split("@")[0]?.replace(/[^a-z0-9]/g, "") ?? "";
  if (local.length >= 4 && lower.replace(/[^a-z0-9]/g, "").includes(local)) issues.push("contains_email");
  if (/^(.)\1+$/.test(password) || new Set(password).size < 4) issues.push("repetitive");
  return issues;
}

/** Solidité indicative de 0 (très faible) à 4 (très solide), pour la jauge. */
export function passwordStrength(password: string, email = ""): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  if (passwordIssues(password, email).length > 0) return password.length >= 6 ? 1 : 0;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\p{L}\d]/u].filter((re) => re.test(password)).length;
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) return 4;
  if (password.length >= 12 || classes >= 3) return 3;
  return 2;
}
