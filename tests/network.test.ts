import { describe, expect, it } from "vitest";
import { networkId } from "@/lib/network";

// Connexion d'un visiteur sans compte : la fin d'une adresse IPv6 change souvent, mais pas son
// début (la box ou le téléphone). Adresses d'exemple réservées à la documentation.

describe("identifiant de connexion", () => {
  it("IPv4 : l'adresse entière", () => {
    expect(networkId("203.0.113.7")).toBe("203.0.113.7");
    expect(networkId("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("IPv6 : même box, fin d'adresse différente → même connexion", () => {
    const a = networkId("2001:db8:350b:9175:69b5:ba5:3658:ef43");
    const b = networkId("2001:0db8:350b:9175:1:2:3:4");
    expect(a).toBe("2001:db8:350b:9175::/64");
    expect(b).toBe(a);
  });

  it("IPv6 : forme courte « :: » et indice de zone", () => {
    expect(networkId("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(networkId("2001:db8:a:b::5%eth0")).toBe("2001:db8:a:b::/64");
  });

  it("IPv6 : deux box différentes restent différentes", () => {
    expect(networkId("2001:db8:aaaa:1::1")).not.toBe(networkId("2001:db8:aaaa:2::1"));
  });
});
