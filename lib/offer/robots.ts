// Lecture des règles robots.txt (RFC 9309) : CV Woo ne récupère une page que si le site
// l'autorise pour les robots. Groupe le plus précis pour notre agent, sinon « * » ;
// la règle la plus longue l'emporte, « Allow » gagne à longueur égale ; « * » et « $ » gérés.

type Rule = { allow: boolean; pattern: string };

function groups(txt: string): { agents: string[]; rules: Rule[] }[] {
  const out: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        out.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      lastWasAgent = false;
      if (key === "disallow" && value === "") continue; // « Disallow: » vide = tout autorisé
      current.rules.push({ allow: key === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return out;
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/** Vrai si robots.txt autorise `agent` à lire `path` (chemin + requête). */
export function isAllowed(robotsTxt: string, agent: string, path: string): boolean {
  const all = groups(robotsTxt);
  const name = agent.toLowerCase();
  const specific = all.filter((g) => g.agents.some((a) => a !== "*" && name.includes(a)));
  const chosen = specific.length ? specific : all.filter((g) => g.agents.includes("*"));
  if (!chosen.length) return true;
  let best: Rule | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!matches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}
