// Extraction d'une offre d'emploi à partir du HTML d'une page, sans IA et sans rien inventer.
// Trois sources, de la plus fiable à la plus approximative :
// 1. données structurées schema.org JobPosting en JSON-LD (la plupart des sites d'emploi) ;
// 2. microdonnées schema.org (attributs itemprop, ex. France Travail) ;
// 3. texte principal de la page (balise <main>, <article> ou corps de page).
// Un champ absent reste absent : il est signalé comme « non trouvé », jamais deviné.

export type OfferFields = {
  title: string | null;
  company: string | null;
  location: string | null;
  contract: string | null;
};

export type ExtractedOffer = OfferFields & {
  source: "structured" | "microdata" | "page";
  /** Texte de l'offre, prêt pour l'analyse : en-tête (poste, entreprise…) puis description. */
  text: string;
  missing: (keyof OfferFields)[];
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|button|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/ul|\/ol|\/section)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clean = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = htmlToText(decodeEntities(String(v))).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 300) : null;
};

// Codes schema.org → français lisible ; une valeur déjà en clair (« CDI ») est gardée telle quelle
const CONTRACTS: Record<string, string> = {
  FULL_TIME: "Temps plein",
  PART_TIME: "Temps partiel",
  CONTRACTOR: "Indépendant / freelance",
  TEMPORARY: "Temporaire (CDD / intérim)",
  INTERN: "Stage",
  INTERNSHIP: "Stage",
  VOLUNTEER: "Bénévolat",
  PER_DIEM: "À la journée",
  APPRENTICESHIP: "Alternance",
  OTHER: "",
};

function contractOf(v: unknown): string | null {
  const values = (Array.isArray(v) ? v : [v]).filter(Boolean).map(String);
  const labels = values.map((x) => CONTRACTS[x.toUpperCase()] ?? x).filter(Boolean);
  return labels.length ? [...new Set(labels)].join(", ").slice(0, 120) : null;
}

function locationOf(v: unknown): string | null {
  const list = Array.isArray(v) ? v : [v];
  const places = list
    .map((loc) => {
      if (!loc || typeof loc !== "object") return clean(loc);
      const address = (loc as { address?: unknown }).address ?? loc;
      if (typeof address === "string") return clean(address);
      const a = address as Record<string, unknown>;
      return [a.addressLocality, a.postalCode, a.addressRegion, a.addressCountry]
        .map((x) => (x && typeof x === "object" ? (x as { name?: string }).name : x))
        .filter(Boolean)
        .map(String)
        .filter((x, i, arr) => arr.indexOf(x) === i)
        .join(", ");
    })
    .filter(Boolean);
  return places.length ? [...new Set(places)].slice(0, 3).join(" ; ") : null;
}

const typeIs = (node: Record<string, unknown>, type: string) =>
  [node["@type"]].flat().some((t) => String(t).toLowerCase() === type.toLowerCase());

/** Premier JobPosting trouvé dans les blocs JSON-LD de la page. */
export function findJsonLdJob(html: string): Record<string, unknown> | null {
  // Le « + » est parfois encodé dans l'attribut (ld&#x2B;json, ex. HelloWork)
  for (const [, json] of html.matchAll(/<script[^>]*type=["']?application\/ld(?:\+|&#x2B;|&#43;)json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(json.trim());
      const queue: unknown[] = [data];
      while (queue.length) {
        const n = queue.shift();
        if (Array.isArray(n)) queue.push(...n);
        else if (n && typeof n === "object") {
          const node = n as Record<string, unknown>;
          if (typeIs(node, "JobPosting")) return node;
          if (node["@graph"]) queue.push(node["@graph"]);
        }
      }
    } catch {
      // JSON invalide : bloc suivant
    }
  }
  return null;
}

function fromJsonLd(job: Record<string, unknown>) {
  const org = job.hiringOrganization;
  const company = clean(typeof org === "object" && org ? (org as { name?: unknown }).name : org);
  const sections: [string, unknown][] = [
    ["", job.description],
    ["Responsabilités", job.responsibilities],
    ["Qualifications", job.qualifications],
    ["Compétences", job.skills],
    ["Expérience demandée", typeof job.experienceRequirements === "object" ? null : job.experienceRequirements],
    ["Formation demandée", typeof job.educationRequirements === "object" ? null : job.educationRequirements],
  ];
  const body = sections
    .map(([label, v]) => {
      if (!v) return null;
      const text = htmlToText(decodeEntities(Array.isArray(v) ? v.join("\n") : String(v)));
      return text ? (label ? `${label} :\n${text}` : text) : null;
    })
    .filter(Boolean)
    .join("\n\n");
  return {
    title: clean(job.title),
    company,
    location: locationOf(job.jobLocation) ?? (job.jobLocationType === "TELECOMMUTE" ? "Télétravail" : null),
    contract: contractOf(job.employmentType),
    body,
  };
}

/** Microdonnées schema.org JobPosting (itemprop) : titre, entreprise, lieu, contrat, description. */
function fromMicrodata(html: string) {
  const scope = html.match(/<[^>]+itemtype=["']https?:\/\/schema\.org\/JobPosting["'][^>]*>[\s\S]*/i)?.[0];
  if (!scope) return null;
  const prop = (name: string) => {
    const tag = scope.match(new RegExp(`<([a-z0-9]+)[^>]*itemprop=["']${name}["'][^>]*>`, "i"));
    if (!tag) return null;
    const content = tag[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return content;
    const rest = scope.slice((tag.index ?? 0) + tag[0].length);
    const close = rest.search(new RegExp(`</${tag[1]}>`, "i"));
    return close >= 0 ? rest.slice(0, close) : null;
  };
  const orgBlock = prop("hiringOrganization");
  const company = orgBlock ? clean(orgBlock.match(/itemprop=["']name["'][^>]*content=["']([^"']*)/i)?.[1] ?? orgBlock) : null;
  const locBlock = prop("jobLocation") ?? prop("addressLocality");
  const description = prop("description");
  return {
    title: clean(prop("title")),
    company,
    location: locBlock ? clean(locBlock) : null,
    contract: contractOf(prop("employmentType") ? clean(prop("employmentType")) : null),
    body: description ? htmlToText(description) : "",
  };
}

function meta(html: string, name: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, "i");
  const m = html.match(re);
  return clean(m?.[1] ?? m?.[2]);
}

function mainText(html: string): string {
  const main =
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<body[\s\S]*<\/body>/i)?.[0] ??
    html;
  return htmlToText(main);
}

const FIELD_LABELS: [keyof OfferFields, string][] = [
  ["title", "Poste"],
  ["company", "Entreprise"],
  ["location", "Lieu"],
  ["contract", "Contrat"],
];

/** Extrait l'offre d'une page HTML. Renvoie null si la page ne contient manifestement pas d'offre. */
export function extractOffer(html: string, platformId?: string | null): ExtractedOffer | null {
  const ld = findJsonLdJob(html);
  const micro = ld ? null : fromMicrodata(html);
  const structured = ld ? fromJsonLd(ld) : micro;
  const source: ExtractedOffer["source"] = ld ? "structured" : micro ? "microdata" : "page";
  const hints = platformId ? SITE_HINTS[platformId]?.(html) : undefined;

  const title =
    structured?.title ?? hints?.title ?? meta(html, "og:title") ?? clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  let body = structured?.body ?? "";
  // Description structurée absente ou trop courte : on prend le texte principal de la page,
  // seulement s'il parle bien de cette offre (il contient son intitulé). Sinon on risquerait de
  // récupérer autre chose (liste d'« autres offres », bandeau…), ce qui fausserait l'analyse.
  if (body.length < 300) {
    const page = mainText(html);
    const anchor = (title ?? "").toLowerCase().split(/\s[-–|·]\s/)[0].trim();
    body = !structured || (anchor.length >= 4 && page.toLowerCase().includes(anchor)) ? page : body;
  }

  const fields: OfferFields = {
    title,
    company: structured?.company ?? hints?.company ?? null,
    location: structured?.location ?? hints?.location ?? null,
    contract: structured?.contract ?? hints?.contract ?? null,
  };

  const header = FIELD_LABELS.filter(([k]) => fields[k]).map(([k, label]) => `${label} : ${fields[k]}`);
  const text = [header.join("\n"), body].filter(Boolean).join("\n\n").slice(0, 20_000).trim();

  if (!looksLikeOffer(text, source)) return null;
  return { ...fields, source, text, missing: FIELD_LABELS.map(([k]) => k).filter((k) => !fields[k]) };
}

/**
 * Extracteurs propres à un site, pour les champs que la page ne donne pas en données structurées.
 * Ils lisent seulement ce que la page affiche (aucune déduction).
 */
const SITE_HINTS: Record<string, (html: string) => Partial<OfferFields>> = {
  // Talent.com : « Poste – Entreprise – Offre d'emploi cdi Ville, Région »
  talent: (html) => {
    const og = meta(html, "og:title");
    if (!og) return {};
    const [title, company, rest] = og.split(/\s+–\s+/);
    const m = rest?.match(/Offre d.emploi\s+(\S+)\s+(.+)$/i);
    return { title: title || null, company: company || null, contract: m?.[1]?.toUpperCase() ?? null, location: m?.[2] ?? null };
  },
};

// Mots qu'on trouve dans presque toutes les offres (FR et EN)
const SIGNALS =
  /\b(missions?|profil|poste|candidat|comp[ée]tences?|exp[ée]rience|cdi|cdd|stage|alternance|int[ée]rim|salaire|r[ée]mun[ée]ration|temps (?:plein|partiel)|responsabilit[ée]s|qualifications?|job|responsibilities|requirements|skills|apply|postuler)\b/gi;

/** Une page d'offre contient assez de texte et le vocabulaire d'une annonce. */
export function looksLikeOffer(text: string, source: ExtractedOffer["source"]): boolean {
  if (text.length < 300) return false;
  if (source !== "page") return true;
  const hits = new Set((text.match(SIGNALS) ?? []).map((w) => w.toLowerCase()));
  return hits.size >= 3;
}
