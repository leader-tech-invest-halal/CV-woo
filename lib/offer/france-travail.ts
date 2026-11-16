import "server-only";
import { UserFacingError } from "@/lib/cv/validate-file";
import { htmlToText, type ExtractedOffer, type OfferFields } from "./extract";

// France Travail charge la description de ses offres après l'affichage de la page : on ne peut pas
// la lire dans le HTML. On passe donc par l'API officielle « Offres d'emploi v2 » (gratuite, sur
// inscription à francetravail.io). Elle n'est utilisée que si les identifiants sont configurés :
//   FRANCE_TRAVAIL_CLIENT_ID et FRANCE_TRAVAIL_CLIENT_SECRET (variables d'environnement Vercel).

const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=%2Fpartenaire";
const OFFER_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/";

let token: { value: string; expires: number } | null = null;

export const franceTravailConfigured = () =>
  Boolean(process.env.FRANCE_TRAVAIL_CLIENT_ID && process.env.FRANCE_TRAVAIL_CLIENT_SECRET);

/** Numéro d'offre dans un lien France Travail (ex. …/offres/recherche/detail/216LZLN). */
export function franceTravailId(url: string): string | null {
  return url.match(/\/detail\/([A-Z0-9]{5,12})(?:[/?#]|$)/i)?.[1]?.toUpperCase() ?? null;
}

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.FRANCE_TRAVAIL_CLIENT_ID!,
    client_secret: process.env.FRANCE_TRAVAIL_CLIENT_SECRET!,
    scope: "api_offresdemploiv2 o2dsoffre",
  });
  const r = await fetch(TOKEN_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new UserFacingError("offer_unreachable");
  const data = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

type FtOffer = {
  intitule?: string;
  description?: string;
  entreprise?: { nom?: string; description?: string };
  lieuTravail?: { libelle?: string };
  typeContratLibelle?: string;
  dureeTravailLibelle?: string;
  experienceLibelle?: string;
  salaire?: { libelle?: string };
  competences?: { libelle?: string }[];
  qualitesProfessionnelles?: { libelle?: string; description?: string }[];
  formations?: { niveauLibelle?: string; domaineLibelle?: string }[];
  permis?: { libelle?: string }[];
  langues?: { libelle?: string }[];
};

export async function fetchFranceTravail(id: string): Promise<ExtractedOffer> {
  const r = await fetch(OFFER_URL + encodeURIComponent(id), {
    headers: { authorization: `Bearer ${await accessToken()}`, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204 || r.status === 404) throw new UserFacingError("offer_not_found");
  if (!r.ok) throw new UserFacingError("offer_unreachable");
  const o = (await r.json()) as FtOffer;

  const fields: OfferFields = {
    title: o.intitule ?? null,
    company: o.entreprise?.nom ?? null,
    location: o.lieuTravail?.libelle ?? null,
    contract: [o.typeContratLibelle, o.dureeTravailLibelle].filter(Boolean).join(" · ") || null,
  };
  const list = (label: string, items: (string | undefined)[]) => {
    const values = items.filter(Boolean);
    return values.length ? `${label} :\n${values.map((v) => `• ${v}`).join("\n")}` : null;
  };
  const text = [
    [
      fields.title && `Poste : ${fields.title}`,
      fields.company && `Entreprise : ${fields.company}`,
      fields.location && `Lieu : ${fields.location}`,
      fields.contract && `Contrat : ${fields.contract}`,
    ]
      .filter(Boolean)
      .join("\n"),
    o.description ? htmlToText(o.description) : null,
    list("Compétences", (o.competences ?? []).map((c) => c.libelle)),
    list("Qualités professionnelles", (o.qualitesProfessionnelles ?? []).map((q) => q.libelle)),
    list("Formation", (o.formations ?? []).map((f) => [f.niveauLibelle, f.domaineLibelle].filter(Boolean).join(" – "))),
    o.experienceLibelle ? `Expérience : ${o.experienceLibelle}` : null,
    list("Langues", (o.langues ?? []).map((l) => l.libelle)),
    list("Permis", (o.permis ?? []).map((p) => p.libelle)),
    o.salaire?.libelle ? `Salaire : ${o.salaire.libelle}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 20_000);

  if (text.length < 200) throw new UserFacingError("offer_blocked");
  return {
    ...fields,
    source: "structured",
    text,
    missing: (["title", "company", "location", "contract"] as const).filter((k) => !fields[k]),
  };
}
