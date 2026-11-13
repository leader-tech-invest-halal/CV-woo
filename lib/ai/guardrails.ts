import type { Block, SkillMatch } from "@/lib/cv/types";

// Vérification automatique côté serveur (règle absolue : ne jamais inventer).
// Tout chiffre, nom propre, outil ou mot-clé présent dans une réécriture mais absent du CV
// d'origine est signalé. Une réécriture signalée n'est pas appliquée tant que l'utilisateur
// ne l'a pas validée lui-même.

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

// Mots courants qui commencent souvent par une majuscule sans être des noms propres
const COMMON = new Set(
  "i a an the and or of in on for to with by le la les un une des de du et ou en au aux pour par sur avec dans".split(" "),
);

/** Termes « factuels » d'un texte : nombres, sigles, outils, noms propres. */
function factualTerms(text: string): { numbers: string[]; terms: string[] } {
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const terms: string[] = [];
  const words = text.split(/\s+/);
  words.forEach((raw, i) => {
    const w = raw.replace(/^[^\p{L}\d#+.]+|[^\p{L}\d#+]+$/gu, "");
    if (w.length < 2 || COMMON.has(w.toLowerCase())) return;
    const prev = words[i - 1] ?? "";
    const sentenceStart = i === 0 || /[.!?:;•\-–]$/.test(prev);
    const technical = /[#+]|\.\w|\d/.test(w) && /\p{L}/u.test(w); // C#, Node.js, ISO9001
    const proper = /^\p{Lu}/u.test(w) && !sentenceStart;
    const acronym = /^\p{Lu}{2,}$/u.test(w);
    if (technical || proper || acronym) terms.push(w);
  });
  return { numbers, terms };
}

export function checkRewrite(
  after: string,
  keywords: string[],
  resumeText: string,
  matches: SkillMatch[],
): string[] {
  const source = normalize(resumeText);
  // Chaque nombre doit exister tel quel dans le CV (5,5 et 5.5 sont équivalents)
  const asNumber = (n: string) => n.replace(",", ".");
  const sourceNumbers = new Set((resumeText.match(/\d+(?:[.,]\d+)?/g) ?? []).map(asNumber));
  const flags = new Set<string>();
  const { numbers, terms } = factualTerms(after);

  for (const n of numbers) {
    if (!sourceNumbers.has(asNumber(n))) flags.add(`number:${n}`);
  }
  for (const t of terms) {
    if (!source.includes(normalize(t))) flags.add(`term:${t}`);
  }
  // Un mot-clé n'est suspect que s'il correspond à une compétence absente du CV.
  // Un simple synonyme (« anomalies » pour « bugs ») n'est pas signalé ; les outils et
  // noms propres inventés sont déjà repérés par la vérification des termes ci-dessus.
  for (const k of keywords) {
    const nk = normalize(k);
    if (nk.length < 2 || source.includes(nk)) continue;
    const claimsMissingSkill = matches.some((m) => {
      if (m.status !== "missing") return false;
      const skill = normalize(m.skill);
      return skill === nk || (nk.length >= 3 && (skill.includes(nk) || nk.includes(skill)));
    });
    if (claimsMissingSkill) flags.add(`keyword:${k}`);
  }
  return [...flags];
}

/** La citation fournie comme preuve doit exister mot pour mot dans le bloc cité. */
export function verifyEvidence(match: SkillMatch, blocks: Map<string, Block>): SkillMatch {
  if (match.status === "missing") return { ...match, evidenceBlockId: null, evidenceQuote: null };
  const block = match.evidenceBlockId ? blocks.get(match.evidenceBlockId) : undefined;
  const ok = block && match.evidenceQuote && normalize(block.text).includes(normalize(match.evidenceQuote));
  if (ok) return match;
  // Pas de preuve vérifiable : la compétence n'est pas considérée comme démontrée
  return { ...match, status: match.status === "present" ? "weak" : match.status, evidenceBlockId: null, evidenceQuote: null };
}
