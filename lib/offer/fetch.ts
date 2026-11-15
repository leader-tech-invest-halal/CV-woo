import "server-only";
import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";
import { UserFacingError } from "@/lib/cv/validate-file";
import { isBlockedIp, parsePublicUrl } from "./safe-url";

// Récupère le texte d'une offre d'emploi à partir de son lien.
// Protections (SSRF) : http(s) uniquement, ports web standards, aucune adresse interne, privée ou
// réservée — vérifiée au moment même de la connexion (pas de « DNS rebinding »), et à chaque
// redirection. Délai, taille téléchargée et taille décompressée limités.
// Beaucoup de sites (LinkedIn, Indeed...) bloquent les robots : l'utilisateur colle alors le texte.

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;

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
          "user-agent": "Mozilla/5.0 (compatible; CVWooBot/1.0)",
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

function decodeEntities(s: string): string {
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

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/** Beaucoup de sites d'emploi publient l'offre en données structurées schema.org (JobPosting). */
function fromJsonLd(html: string): string | null {
  const scripts = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, json] of scripts) {
    try {
      const data = JSON.parse(json);
      const nodes = (Array.isArray(data) ? data : data["@graph"] ?? [data]) as Record<string, unknown>[];
      const job = nodes.find((n) => n && n["@type"] === "JobPosting");
      if (!job) continue;
      const org = (job.hiringOrganization as { name?: string } | undefined)?.name;
      const parts = [
        job.title && `Poste : ${decodeEntities(String(job.title))}`,
        org && `Entreprise : ${decodeEntities(org)}`,
        job.description && htmlToText(decodeEntities(String(job.description))),
        job.qualifications && `Qualifications : ${htmlToText(String(job.qualifications))}`,
        job.skills && `Compétences : ${htmlToText(String(job.skills))}`,
      ].filter(Boolean);
      if (parts.length) return parts.join("\n\n");
    } catch {
      // JSON invalide : on essaie le bloc suivant
    }
  }
  return null;
}

export async function fetchOfferText(raw: string): Promise<{ text: string; url: string }> {
  let url = parsePublicUrl(raw);
  if (!url) throw new UserFacingError("invalid_url");
  const deadline = Date.now() + TIMEOUT_MS;
  let response: Fetched | null = null;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    try {
      response = await get(url, deadline);
    } catch (error) {
      // Adresse interne détectée à la connexion : lien refusé, sans dire pourquoi
      if ((error as { code?: string }).code === "EBLOCKED") throw new UserFacingError("invalid_url");
      throw new UserFacingError("offer_unreachable");
    }
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (i === MAX_REDIRECTS) throw new UserFacingError("offer_unreachable");
      // Chaque redirection est revérifiée comme un nouveau lien
      const next = parsePublicUrl(new URL(response.location, url).toString());
      if (!next) throw new UserFacingError("invalid_url");
      url = next;
      continue;
    }
    break;
  }

  if (!response || response.status < 200 || response.status >= 300) throw new UserFacingError("offer_unreachable");
  if (!/text\/html|application\/xhtml|text\/plain/.test(response.type)) throw new UserFacingError("offer_unreachable");

  const html = new TextDecoder().decode(response.body);

  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const text = (fromJsonLd(html) ?? htmlToText(main)).slice(0, 20_000);

  // Page vide, page de connexion ou anti-robot : trop peu de texte pour être une offre
  if (text.length < 300) throw new UserFacingError("offer_blocked");
  return { text, url: url.toString() };
}
