import { describe, expect, it } from "vitest";
import { extractOffer } from "@/lib/offer/extract";
import { detectPlatform, PLATFORMS } from "@/lib/offer/platforms";
import { isAllowed } from "@/lib/offer/robots";
import { franceTravailId } from "@/lib/offer/france-travail";

// Récupération des offres : extracteurs, registre des plateformes, règles robots.txt.
// Pages d'exemple fictives, construites sur le modèle des vrais sites (aucun appel réseau).

const page = (head: string, body: string) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const DESCRIPTION =
  "<h2>Les missions du poste</h2><p>Accueillir les clients, les conseiller et assurer l'encaissement. Mettre en rayon et participer aux inventaires.</p><h2>Le profil recherché</h2><ul><li>Première expérience en vente appréciée</li><li>Sens du service et du travail en équipe</li></ul><p>Rémunération selon profil, CDI 35 h, poste à pourvoir rapidement. Vous rejoignez une équipe de douze personnes dans un magasin récemment rénové.</p>";

describe("extraction d'une offre", () => {
  it("lit les données structurées JobPosting, même avec le « + » encodé (cas HelloWork)", () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Vendeur - Vendeuse H/F",
      description: DESCRIPTION,
      hiringOrganization: { "@type": "Organization", name: "Magasin Fictif" },
      jobLocation: { "@type": "Place", address: { addressLocality: "Niort", postalCode: "79000", addressCountry: "FR" } },
      employmentType: "FULL_TIME",
    };
    const html = page(`<script type="application/ld&#x2B;json">${JSON.stringify(ld)}</script>`, "<main>Autre contenu</main>");
    const o = extractOffer(html)!;
    expect(o.source).toBe("structured");
    expect(o).toMatchObject({ title: "Vendeur - Vendeuse H/F", company: "Magasin Fictif", location: "Niort, 79000, FR", contract: "Temps plein" });
    expect(o.missing).toEqual([]);
    expect(o.text).toContain("Poste : Vendeur - Vendeuse H/F");
    expect(o.text).toContain("Accueillir les clients");
    expect(o.text).toContain("• Première expérience en vente appréciée");
  });

  it("trouve le JobPosting dans un @graph et garde un contrat déjà en clair", () => {
    const ld = { "@graph": [{ "@type": "WebPage" }, { "@type": ["JobPosting"], title: "Équipier", description: DESCRIPTION, employmentType: "CDI" }] };
    const o = extractOffer(page(`<script type="application/ld+json">${JSON.stringify(ld)}</script>`, ""))!;
    expect(o.title).toBe("Équipier");
    expect(o.contract).toBe("CDI");
    expect(o.missing).toEqual(["company", "location"]);
  });

  it("n'invente jamais un champ absent : il est signalé comme manquant", () => {
    const o = extractOffer(page('<meta property="og:title" content="Équipier polyvalent">', `<main>${DESCRIPTION}</main>`))!;
    expect(o.source).toBe("page");
    expect(o.title).toBe("Équipier polyvalent");
    expect(o.company).toBeNull();
    expect(o.missing).toEqual(["company", "location", "contract"]);
    expect(o.text).not.toMatch(/Entreprise :|Lieu :|Contrat :/);
  });

  it("lit Talent.com : poste, entreprise, contrat et lieu depuis le titre de la page", () => {
    const html = page(
      '<meta property="og:title" content="Vendeur H/F – Intersport – Offre d&#x27;emploi cdi Arcueil, IDF">',
      `<main><h1>Vendeur H/F</h1>${DESCRIPTION}</main>`,
    );
    expect(extractOffer(html, "talent")).toMatchObject({ title: "Vendeur H/F", company: "Intersport", contract: "CDI", location: "Arcueil, IDF" });
  });

  it("ne récupère pas un autre texte quand la description est chargée après coup (cas France Travail)", () => {
    const html = page(
      "<title>Offre d'emploi VENDEUR H/F - Marseille | France Travail</title>",
      `<main><div itemtype="http://schema.org/JobPosting" itemscope><descriptif-offre id-offre="216LZLN"></descriptif-offre>
       <h2>D'autres offres peuvent vous intéresser :</h2>${"<p>Agent de nettoyage, CDI, missions variées, profil débutant accepté, poste à Lyon.</p>".repeat(8)}</div></main>`,
    );
    expect(extractOffer(html)).toBeNull();
  });

  it("refuse une page qui n'est pas une offre (page de connexion, accueil…)", () => {
    expect(extractOffer(page("<title>Connexion</title>", "<main><form>E-mail, mot de passe</form><p>Mot de passe oublié ?</p></main>"))).toBeNull();
    expect(extractOffer(page("<title>Accueil</title>", `<main>${"Découvrez nos magasins et nos produits. ".repeat(20)}</main>`))).toBeNull();
  });
});

describe("registre des plateformes", () => {
  it.each([
    ["https://fr.linkedin.com/jobs/view/123", "linkedin", "manual"],
    ["https://fr.indeed.com/viewjob?jk=abc", "indeed", "manual"],
    ["https://www.hellowork.com/fr-fr/emplois/1.html", "hellowork", "auto"],
    ["https://candidat.francetravail.fr/offres/recherche/detail/216LZLN", "francetravail", "manual"],
    ["https://jobs.lever.co/acme/abc", "lever", "auto"],
    ["https://emploi.sncf.com/nos-offres/858826", "sncf", "auto"],
  ])("reconnaît %s", (url, id, method) => {
    expect(detectPlatform(url)).toMatchObject({ id, method });
  });

  it("laisse les sites inconnus à l'extracteur générique", () => {
    expect(detectPlatform("https://recrutement.entreprise-fictive.fr/offre/42")).toBeNull();
    expect(detectPlatform("pas un lien")).toBeNull();
  });

  it("n'a pas de doublon de domaine et explique chaque copier-coller", () => {
    const domains = PLATFORMS.flatMap((p) => p.domains);
    expect(new Set(domains).size).toBe(domains.length);
    for (const p of PLATFORMS.filter((x) => x.method === "manual")) expect(p.reason, p.id).toBeTruthy();
  });

  it("lit le numéro d'une offre France Travail", () => {
    expect(franceTravailId("https://candidat.francetravail.fr/offres/recherche/detail/216lzln")).toBe("216LZLN");
    expect(franceTravailId("https://candidat.francetravail.fr/offres/recherche?motsCles=x")).toBeNull();
  });
});

describe("règles robots.txt", () => {
  const robots = `User-agent: Googlebot
Allow: /

User-agent: *
Disallow: /jobs/view/
Allow: /jobs/view/public$
Disallow: /*?private=

User-agent: CVWooBot
Disallow: /interdit-a-cv-woo/
`;
  it("applique le groupe propre à CV Woo s'il existe", () => {
    expect(isAllowed(robots, "CVWooBot", "/interdit-a-cv-woo/1")).toBe(false);
    expect(isAllowed(robots, "CVWooBot", "/jobs/view/1")).toBe(true); // notre groupe ne l'interdit pas
  });
  it("sinon applique « * », la règle la plus précise l'emporte", () => {
    expect(isAllowed(robots, "AutreRobot", "/jobs/view/123")).toBe(false);
    expect(isAllowed(robots, "AutreRobot", "/jobs/view/public")).toBe(true);
    expect(isAllowed(robots, "AutreRobot", "/offres?private=1")).toBe(false);
    expect(isAllowed(robots, "AutreRobot", "/offres/1")).toBe(true);
  });
  it("autorise tout sans robots.txt", () => {
    expect(isAllowed("", "CVWooBot", "/n-importe-quoi")).toBe(true);
  });
});
