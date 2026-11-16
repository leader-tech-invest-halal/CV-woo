import "server-only";
import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { UserFacingError } from "@/lib/cv/validate-file";
import { isBlockedIp, parsePublicUrl } from "./safe-url";
import { isAllowed } from "./robots";
import { detectPlatform, normalizeJobUrl } from "./platforms";
import { extractOffer, type ExtractedOffer, type OfferFields } from "./extract";
import { fetchFranceTravail, franceTravailConfigured, franceTravailId } from "./france-travail";

// Récupère le texte d'une offre d'emploi à partir de son lien.
// Protections (SSRF) : http(s) uniquement, ports web standards, aucune adresse interne, privée ou
// réservée — vérifiée au moment même de la connexion (pas de « DNS rebinding »), et à chaque
// redirection. Délai, taille téléchargée et taille décompressée limités.
// Beaucoup de sites (LinkedIn, Indeed...) bloquent les robots : l'utilisateur colle alors le texte.

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;
// Nom du robot, tel qu'annoncé aux sites (respect de leurs règles robots.txt)
const ROBOT_NAME = "CVWooBot";

/** Résolution DNS qui refuse toute adresse interne : c'est l'adresse vérifiée qui est utilisée. */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 4);
    const list = addresses as { address: string; family: number }[];
    if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
      return callback(Object.assign(new Error("Adresse interdite"), { code: "EBLOCKED" }), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

type Fetched = { status: number; location: string | null; type: string; body: Buffer };

function get(url: URL, deadline: number): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        agent: false,
        timeout: Math.max(1000, deadline - Date.now()),
        headers: {
          "user-agent": `Mozilla/5.0 (compatible; ${ROBOT_NAME}/1.0; +https://cv-woo.vercel.app)`,
          accept: "text/html,application/xhtml+xml",
          "accept-language": "fr,en;q=0.8",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location ?? null;
        const type = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location, type, body: Buffer.alloc(0) });
        }
        // Décompression plafonnée : une page compressée ne peut pas dépasser MAX_BYTES une fois ouverte
        const encoding = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : encoding === "br"
                ? res.pipe(zlib.createBrotliDecompress())
                : res;
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            return resolve({ status, location, type, body: Buffer.concat(chunks) });
          }
          chunks.push(chunk);
        });
        stream.on("end", () => resolve({ status, location, type, body: Buffer.concat(chunks) }));
        stream.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** Règles robots.txt par site, gardées une heure en mémoire. */
const robotsCache = new Map<string, { txt: string; at: number }>();

async function robotsAllow(url: URL, deadline: number): Promise<boolean> {
  const cached = robotsCache.get(url.origin);
  let txt = cached && Date.now() - cached.at < 3_600_000 ? cached.txt : null;
  if (txt === null) {
    try {
      const r = await get(new URL("/robots.txt", url), Math.min(deadline, Date.now() + 4000));
      // Pas de robots.txt (4xx) : tout est autorisé ; 5xx : on reste prudent et on autorise aussi
      txt = r.status >= 200 && r.status < 300 && /text\/plain/i.test(r.type || "text/plain") ? new TextDecoder().decode(r.body) : "";
    } catch {
      txt = "";
    }
    robotsCache.set(url.origin, { txt, at: Date.now() });
  }
  return isAllowed(txt, ROBOT_NAME, url.pathname + url.search);
}

/** Page d'accueil ou d'une langue (/, /fr, /fr-fr/) : signe d'une offre expirée redirigée. */
const isHomePath = (path: string) => /^\/(?:[a-z]{2}(?:[-_][a-z]{2})?\/?)?$/i.test(path);

export type OfferResult = {
  text: string;
  url: string;
  platform: { id: string; name: string } | null;
  fields: OfferFields;
  missing: (keyof OfferFields)[];
  source: ExtractedOffer["source"];
};

/**
 * Récupère une offre d'emploi à partir de son lien, sur presque tous les sites :
 * plateforme connue (registre) ou extracteur générique. Ne lit jamais une page interdite par
 * le site (robots.txt) et ne contourne aucune protection : dans ces cas, copier-coller.
 */
export async function fetchOfferText(raw: string): Promise<OfferResult> {
  // Les liens de liste, de recherche ou d'e-mail sont ramenés à la page de l'offre (ex. LinkedIn)
  let url = parsePublicUrl(normalizeJobUrl(raw));
  if (!url) throw new UserFacingError("invalid_url");
  const platform = detectPlatform(url.toString());
  const result = (offer: ExtractedOffer, final: URL): OfferResult => ({
    text: offer.text,
    url: final.toString(),
    platform: platform ? { id: platform.id, name: platform.name } : null,
    fields: { title: offer.title, company: offer.company, location: offer.location, contract: offer.contract },
    missing: offer.missing,
    source: offer.source,
  });

  // France Travail : API officielle (la page charge l'offre après coup), si elle est configurée
  if (platform?.id === "francetravail" && franceTravailConfigured()) {
    const id = franceTravailId(url.toString());
    if (id) return result(await fetchFranceTravail(id), url);
  }
  if (platform?.method === "manual") throw new UserFacingError("offer_manual");

  const deadline = Date.now() + TIMEOUT_MS;
  const originalPath = url.pathname;
  let response: Fetched | null = null;

  let retried = false;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    // robots.txt respecté, sauf pour les plateformes où le fondateur a choisi de maintenir la lecture
    if (!platform?.ignoreRobots && !(await robotsAllow(url, deadline))) throw new UserFacingError("offer_manual");
    try {
      response = await get(url, deadline);
      // « Trop de demandes » (429) : un seul nouvel essai, après une courte pause
      if (response.status === 429 && !retried && deadline - Date.now() > 4000) {
        retried = true;
        await new Promise((r) => setTimeout(r, 1500));
        response = await get(url, deadline);
      }
    } catch (error) {
      // Adresse interne détectée à la connexion : lien refusé, sans dire pourquoi
      if ((error as { code?: string }).code === "EBLOCKED") throw new UserFacingError("invalid_url");
      throw new UserFacingError("offer_unreachable");
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (i === MAX_REDIRECTS) throw new UserFacingError("offer_unreachable");
      // Chaque redirection est revérifiée comme un nouveau lien
      const next = parsePublicUrl(normalizeJobUrl(new URL(response.location, url).toString()));
      if (!next) throw new UserFacingError("invalid_url");
      url = next;
      continue;
    }
    break;
  }

  if (!response) throw new UserFacingError("offer_unreachable");
  // Accès refusé par le site (protection anti-robots) : on ne contourne pas
  if (response.status === 429) throw new UserFacingError("offer_busy");
  if ([401, 403, 451].includes(response.status)) throw new UserFacingError("offer_blocked");
  if (response.status === 404 || response.status === 410) throw new UserFacingError("offer_not_found");
  if (response.status < 200 || response.status >= 300) throw new UserFacingError("offer_unreachable");
  if (!/text\/html|application\/xhtml|text\/plain/.test(response.type)) throw new UserFacingError("offer_unreachable");
  // Offre expirée : le site renvoie vers sa page d'accueil
  if (!isHomePath(originalPath) && isHomePath(url.pathname)) throw new UserFacingError("offer_not_found");
  // … ou vers une page générale (ex. /gb/en) qui ne reprend plus l'identifiant de l'offre
  const lastSegment = originalPath.split("/").filter(Boolean).pop() ?? "";
  if (
    url.pathname !== originalPath &&
    url.pathname.split("/").filter(Boolean).length <= 2 &&
    lastSegment.length >= 4 &&
    !url.toString().includes(lastSegment)
  ) {
    throw new UserFacingError("offer_not_found");
  }

  const offer = extractOffer(new TextDecoder().decode(response.body), platform?.id);
  // Page de connexion, anti-robot, offre retirée… : pas d'annonce reconnaissable
  if (!offer) throw new UserFacingError("offer_blocked");

  return result(offer, url);
}
