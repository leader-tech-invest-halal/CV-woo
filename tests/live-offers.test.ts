import { describe, it } from "vitest";
import { fetchOfferText } from "@/lib/offer/fetch";

// Test EN DIRECT sur de vraies offres publiques (réseau requis). Lancé seulement à la demande :
//   LIVE=1 npx vitest run tests/live-offers.test.ts
// Les offres expirent : remplacez les liens si besoin. Le résultat s'affiche dans la console.

const URLS: Record<string, string> = {
  hellowork: "https://www.hellowork.com/fr-fr/emplois/84478797.html",
  francetravail: "https://candidat.francetravail.fr/offres/recherche/detail/216LZLN",
  talent: "https://fr.talent.com/view?id=640397830454253765",
  meteojob: "https://www.meteojob.com/jobs/57867706",
  sncf: "https://emploi.sncf.com/nos-offres/858826",
  linkedin: "https://www.linkedin.com/jobs/view/vendeur-confirm%C3%A9-h-f-at-car-avenue-group-4477374934",
  indeed: "https://fr.indeed.com/viewjob?jk=0000000000000000",
  wttj: "https://www.welcometothejungle.com/fr/companies/de-neuville-groupe-savencia/jobs/vendeur-euse-gare-de-l-est-cdi-35h_paris",
  loreal: "https://careers.loreal.com/fr_FR/jobs/JobDetail/Product-Manager/251887",
  orange: "https://orange.jobs/jobs/v3/offers/150196",
  accor: "https://careers.accor.com/global/en/job/receptionniste-h-f-x-in-novotel-paris-20-belleville-paris-france-jid-93603",
  ...(process.env.EXTRA_URLS ? JSON.parse(process.env.EXTRA_URLS) : {}),
};

describe.runIf(process.env.LIVE === "1")("offres réelles", () => {
  for (const [name, url] of Object.entries(URLS)) {
    it(name, { timeout: 30_000 }, async () => {
      try {
        const r = await fetchOfferText(url);
        console.log(
          `✅ ${name.padEnd(14)} ${r.source.padEnd(10)} ${r.text.length} car. | ${r.fields.title ?? "—"} | ${r.fields.company ?? "—"} | ${r.fields.location ?? "—"} | ${r.fields.contract ?? "—"} | manque: ${r.missing.join(",") || "rien"}`,
        );
      } catch (e) {
        console.log(`⛔ ${name.padEnd(14)} ${(e as { code?: string }).code ?? (e as Error).message}`);
      }
    });
  }
});
