import { describe, expect, it } from "vitest";
import { isBlockedIp, parsePublicUrl } from "@/lib/offer/safe-url";
import { fetchOfferText, safeLookup } from "@/lib/offer/fetch";

// Protection SSRF : un lien d'offre ne doit jamais permettre d'atteindre le serveur ou un réseau interne.

describe("liens d'offres : adresses interdites", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254", // métadonnées cloud
    "100.64.0.1",
    "0.0.0.0",
    "198.18.0.1",
    "::1",
    "::ffff:7f00:1", // 127.0.0.1 écrite en IPv6
    "::ffff:a9fe:a9fe", // 169.254.169.254 écrite en IPv6
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "fd00::1",
    "fe80::1",
    "pas-une-ip",
  ])("refuse %s", (ip) => expect(isBlockedIp(ip)).toBe(true));

  it.each(["93.184.216.34", "2606:4700::6810:84e5"])("accepte l'adresse publique %s", (ip) => expect(isBlockedIp(ip)).toBe(false));

  it.each([
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://127.1/",
    "http://localhost/",
    "http://metadata.google.internal/",
    "http://169.254.169.254/latest/meta-data/",
    "http://exemple.fr:8080/",
    "http://user:pass@exemple.fr/",
    "file:///etc/passwd",
    "ftp://exemple.fr/",
    "javascript:alert(1)",
  ])("refuse le lien %s", (url) => expect(parsePublicUrl(url)).toBeNull());

  it("accepte un lien d'offre classique", () => {
    expect(parsePublicUrl("https://www.welcometothejungle.com/fr/jobs/123")?.hostname).toBe("www.welcometothejungle.com");
  });

  it("refuse à la connexion un nom de domaine qui pointe vers une adresse interne", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) =>
      safeLookup("localhost", {}, (e) => resolve(e)),
    );
    expect(error?.code).toBe("EBLOCKED");
  });

  it("renvoie une erreur « lien invalide » sans faire de requête", async () => {
    await expect(fetchOfferText("http://[::ffff:7f00:1]/")).rejects.toMatchObject({ code: "invalid_url" });
  });
});

describe("fichiers Word piégés", () => {
  it("refuse une archive qui se décompresse en un énorme document (zip bomb)", async () => {
    const JSZip = (await import("jszip")).default;
    const { extractDocx } = await import("@/lib/cv/docx");
    const zip = new JSZip();
    // 40 Mo de texte une fois ouvert, environ 40 Ko compressé
    zip.file("word/document.xml", "<w:document>" + "A".repeat(40 * 1024 * 1024) + "</w:document>");
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    expect(bytes.length).toBeLessThan(1024 * 1024);
    await expect(extractDocx(bytes)).rejects.toMatchObject({ code: "unsupported_file" });
  });

  it("refuse une archive avec des milliers de fichiers", async () => {
    const JSZip = (await import("jszip")).default;
    const { openZip } = await import("@/lib/cv/zip-guard");
    const zip = new JSZip();
    for (let i = 0; i < 2500; i++) zip.file(`x/${i}.txt`, "a");
    await expect(openZip(await zip.generateAsync({ type: "uint8array" }))).rejects.toMatchObject({ code: "unsupported_file" });
  });

  it("refuse un fichier qui n'est ni un PDF ni un Word, quelle que soit son extension", async () => {
    const { detectFormat } = await import("@/lib/cv/validate-file");
    expect(() => detectFormat(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toThrow();
    expect(() => detectFormat(new Uint8Array(6 * 1024 * 1024))).toThrow();
  });
});

describe("mots de passe", async () => {
  const { passwordIssues, passwordStrength } = await import("@/lib/auth/password");

  it.each(["court1", "azerty2024!", "Motdepasse123", "1234567890", "aaaaaaaaaa1", "sansaucunchiffre", "camille.exemple99"])(
    "refuse « %s »",
    (p) => expect(passwordIssues(p, "camille.exemple@exemple.fr").length).toBeGreaterThan(0),
  );

  it.each(["Velo-rouge-2031", "maison bleue 47 soleil couchant", "Tq8!vLm2#pRz"])("accepte « %s »", (p) => {
    expect(passwordIssues(p, "camille.exemple@exemple.fr")).toEqual([]);
    expect(passwordStrength(p)).toBeGreaterThanOrEqual(2);
  });

  it("donne une jauge faible à un mot de passe refusé", () => {
    expect(passwordStrength("azerty123")).toBeLessThanOrEqual(1);
  });
});
