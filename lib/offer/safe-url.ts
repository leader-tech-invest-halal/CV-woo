import { BlockList, isIP } from "node:net";

// Adresses interdites pour la récupération d'une offre (protection SSRF) :
// réseau privé, boucle locale, liaison locale (dont 169.254.169.254, métadonnées cloud),
// plages réservées, documentation, multidiffusion, et formats IPv6 qui encapsulent une IPv4.

// Deux listes séparées : Node compare aussi une IPv4 aux règles IPv6 « ::ffff:0:0/96 »
const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked4.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128], // non spécifiée
  ["::1", 128], // boucle locale
  ["::", 96], // IPv4 compatible (obsolète)
  ["::ffff:0:0", 96], // IPv4 encapsulée (ex. [::ffff:7f00:1] = 127.0.0.1)
  ["64:ff9b::", 96], // NAT64
  ["64:ff9b:1::", 48],
  ["100::", 64], // à jeter
  ["2001::", 23], // réservé IETF (dont Teredo)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4
  ["fc00::", 7], // privé
  ["fe80::", 10], // liaison locale
  ["fec0::", 10], // site local (obsolète)
  ["ff00::", 8], // multidiffusion
] as const) {
  blocked6.addSubnet(net, prefix, "ipv6");
}

/** Vrai si l'adresse IP n'est pas une adresse publique joignable sans risque. */
export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return blocked4.check(ip, "ipv4");
  if (family === 6) return blocked6.check(ip, "ipv6");
  return true; // pas une adresse IP valide : refusée
}

/** Lien accepté : http(s) seulement, sans identifiants, port web standard, et pas une IP interne. */
export function parsePublicUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return null;
  if (isIP(host) && isBlockedIp(host)) return null;
  return url;
}
