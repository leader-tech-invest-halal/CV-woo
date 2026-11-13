import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { UserFacingError } from "@/lib/cv/validate-file";

// Récupère le texte d'une offre d'emploi à partir de son lien.
// Protections : http(s) uniquement, pas d'adresse interne ou privée (y compris après redirection),
// délai et taille limités. Beaucoup de sites (LinkedIn, Indeed...) bloquent les robots :
// dans ce cas l'utilisateur est invité à coller le texte.

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UserFacingError("invalid_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new UserFacingError("invalid_url");
  if (url.username || url.password) throw new UserFacingError("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new UserFacingError("invalid_url");
  }
  return url;
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
  let url = await assertPublicUrl(raw);
  let response: Response | null = null;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; CVWooBot/1.0)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "fr,en;q=0.8",
      },
    }).catch(() => null);
    if (!response) throw new UserFacingError("offer_unreachable");
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      url = await assertPublicUrl(new URL(response.headers.get("location")!, url).toString());
      continue;
    }
    break;
  }

  if (!response || !response.ok) throw new UserFacingError("offer_unreachable");
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/.test(type)) throw new UserFacingError("offer_unreachable");

  // Lecture plafonnée
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const html = new TextDecoder().decode(Buffer.concat(chunks));

  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html;
  const text = (fromJsonLd(html) ?? htmlToText(main)).slice(0, 20_000);

  // Page vide, page de connexion ou anti-robot : trop peu de texte pour être une offre
  if (text.length < 300) throw new UserFacingError("offer_blocked");
  return { text, url: url.toString() };
}
