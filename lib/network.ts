// Identifiant de la connexion d'un visiteur sans compte, pour l'essai gratuit et les limites.
//
// - Adresse IPv4 : l'adresse entière.
// - Adresse IPv6 : seulement le début (préfixe « /64 »), qui désigne la box ou le téléphone.
//   La fin d'une adresse IPv6 change souvent, parfois chaque jour (adresses « temporaires ») :
//   sans ce regroupement, un même visiteur retrouvait un essai gratuit à chaque changement.

export function networkId(raw: string): string {
  const ip = raw.trim().replace(/%.*$/, ""); // sans l'indice de zone (« %eth0 »)
  // IPv4 écrite en IPv6 (« ::ffff:92.92.129.106 ») : on garde l'IPv4
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(":")) return ip;

  // Développe la forme courte « :: » pour retrouver les 8 groupes de l'adresse
  const [head, tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : ip.split(":");
  if (groups.length < 4) return ip.toLowerCase();
  const prefix = groups
    .slice(0, 4)
    .map((g) => (g || "0").toLowerCase().replace(/^0+(?=[0-9a-f])/, ""))
    .join(":");
  return `${prefix}::/64`;
}
