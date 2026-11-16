// Registre des plateformes d'emploi connues. Pour en ajouter une : une ligne ici.
// - method "auto" : on lit la page (données structurées, microdonnées ou texte de la page) ;
// - method "manual" : le site interdit la lecture par des robots (robots.txt) ou la bloque
//   (accès refusé) : on ne contourne jamais ces règles, on propose le copier-coller.
// - status : résultat des tests réels sur le serveur de production (voir tests/offer-sources.md).
//   "ok" = poste, entreprise et texte complet récupérés ; "partial" = texte récupéré mais champs
//   incomplets ou pages parfois bloquées ; "manual" = copier-coller nécessaire.
// Les sites non listés passent par l'extracteur générique (qui suit les mêmes règles).

export type PlatformKind = "board" | "company" | "ats";
export type PlatformStatus = "ok" | "partial" | "manual";

export type Platform = {
  id: string;
  name: string;
  domains: string[];
  kind: PlatformKind;
  method: "auto" | "manual";
  status: PlatformStatus;
  /** Raison affichée quand le copier-coller est nécessaire. */
  reason?: "robots" | "blocked" | "dynamic";
  /**
   * Lecture maintenue malgré robots.txt, par décision du fondateur (page publique de l'offre,
   * lue une fois à la demande de l'utilisateur, avec l'identité réelle de CV Woo).
   */
  ignoreRobots?: boolean;
};

export const PLATFORMS: Platform[] = [
  // ——— Plateformes généralistes ———
  { id: "linkedin", name: "LinkedIn", domains: ["linkedin.com", "lnkd.in"], kind: "board", method: "auto", status: "ok", ignoreRobots: true },
  { id: "indeed", name: "Indeed", domains: ["indeed.com", "indeed.fr"], kind: "board", method: "manual", status: "manual", reason: "robots" },
  { id: "hellowork", name: "HelloWork", domains: ["hellowork.com", "regionsjob.com"], kind: "board", method: "auto", status: "ok" },
  // France Travail : description chargée après l'affichage ; lue par l'API officielle si elle est configurée
  { id: "francetravail", name: "France Travail", domains: ["francetravail.fr", "pole-emploi.fr"], kind: "board", method: "manual", status: "manual", reason: "dynamic" },
  { id: "wttj", name: "Welcome to the Jungle", domains: ["welcometothejungle.com"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "apec", name: "APEC", domains: ["apec.fr"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "meteojob", name: "Meteojob", domains: ["meteojob.com"], kind: "board", method: "auto", status: "ok" },
  { id: "talent", name: "Talent.com", domains: ["talent.com"], kind: "board", method: "auto", status: "ok" },
  { id: "jooble", name: "Jooble", domains: ["jooble.org"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "jobijoba", name: "Jobijoba", domains: ["jobijoba.com"], kind: "board", method: "auto", status: "partial" },
  { id: "monster", name: "Monster", domains: ["monster.fr", "monster.com"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "cadremploi", name: "Cadremploi", domains: ["cadremploi.fr"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "jobteaser", name: "JobTeaser", domains: ["jobteaser.com"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "glassdoor", name: "Glassdoor", domains: ["glassdoor.fr", "glassdoor.com"], kind: "board", method: "manual", status: "manual", reason: "blocked" },
  { id: "leboncoin", name: "leboncoin", domains: ["leboncoin.fr"], kind: "board", method: "manual", status: "manual", reason: "blocked" },

  // ——— Sites carrière des entreprises ———
  { id: "mcdonalds", name: "McDonald's", domains: ["mcdonalds.fr", "mcdonalds.com"], kind: "company", method: "manual", status: "manual", reason: "blocked" },
  { id: "carrefour", name: "Carrefour", domains: ["carrefour.fr", "carrefour.com"], kind: "company", method: "manual", status: "manual", reason: "blocked" },
  { id: "decathlon", name: "Decathlon", domains: ["decathlon.fr", "decathlon.com"], kind: "company", method: "auto", status: "partial" },
  { id: "loreal", name: "L'Oréal", domains: ["loreal.com"], kind: "company", method: "auto", status: "partial" },
  { id: "amazon", name: "Amazon Jobs", domains: ["amazon.jobs"], kind: "company", method: "auto", status: "partial" },
  { id: "sncf", name: "SNCF", domains: ["sncf.com"], kind: "company", method: "auto", status: "ok" },
  { id: "laposte", name: "La Poste", domains: ["laposterecrute.fr", "laposte.fr"], kind: "company", method: "manual", status: "manual", reason: "blocked" },
  { id: "orange", name: "Orange", domains: ["orange.jobs"], kind: "company", method: "auto", status: "partial" },
  { id: "accor", name: "Accor", domains: ["accor.com"], kind: "company", method: "auto", status: "partial" },
  { id: "lidl", name: "Lidl", domains: ["lidl.fr", "lidl.jobs"], kind: "company", method: "auto", status: "partial" },

  // ——— Logiciels de recrutement utilisés par de nombreuses entreprises ———
  { id: "workday", name: "Workday", domains: ["myworkdayjobs.com"], kind: "ats", method: "auto", status: "partial" },
  { id: "smartrecruiters", name: "SmartRecruiters", domains: ["smartrecruiters.com"], kind: "ats", method: "auto", status: "partial" },
  { id: "greenhouse", name: "Greenhouse", domains: ["greenhouse.io"], kind: "ats", method: "auto", status: "partial" },
  { id: "lever", name: "Lever", domains: ["lever.co"], kind: "ats", method: "auto", status: "ok" },
  { id: "teamtailor", name: "Teamtailor", domains: ["teamtailor.com"], kind: "ats", method: "auto", status: "ok" },
  { id: "recruitee", name: "Recruitee", domains: ["recruitee.com"], kind: "ats", method: "auto", status: "ok" },
];

/** Plateforme d'un lien (par nom de domaine), ou null si inconnue. */
/**
 * Ramène toutes les formes de liens LinkedIn vers la page de l'offre elle-même :
 * liste ou recherche (?currentJobId=…), e-mail (/comm/jobs/view/…), lien avec titre
 * (/jobs/view/titre-…-123), application mobile. Les autres liens sont rendus tels quels.
 */
export function normalizeJobUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw;
  }
  if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return raw;
  // Seuls les liens qui ne sont pas déjà la page de l'offre sont convertis : LinkedIn redirige
  // lui-même /jobs/view/123 vers /jobs/view/titre-123 (le convertir créerait une boucle).
  const id =
    url.searchParams.get("currentJobId")?.match(/^\d{6,}$/)?.[0] ?? url.pathname.match(/^\/comm\/jobs\/view\/(\d{6,})/)?.[1];
  return id ? `https://www.linkedin.com/jobs/view/${id}/` : raw;
}

export function detectPlatform(raw: string): Platform | null {
  let host: string;
  try {
    host = new URL(raw.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  return PLATFORMS.find((p) => p.domains.some((d) => host === d || host.endsWith(`.${d}`))) ?? null;
}
