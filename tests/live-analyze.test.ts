import { it } from "vitest";

// Essai réel de l'analyse (format de réponse accepté par l'API, consignes suivies) : CV et offre fictifs.
// Lancé seulement avec LIVE=1 (appel payant à l'IA, clé lue dans .env.local, jamais affichée).
it.runIf(process.env.LIVE)("analyse réelle", async () => {
  process.loadEnvFile(".env.local");
  const { analyze } = await import("@/lib/ai/analyze");
  const blocks = [
    ["b0", "camille exemple"],
    ["b1", "camille@exemple.fr"],
    ["b2", "Lyon"],
    ["b3", "PROFIL"],
    ["b4", "Étudiante en licence de gestion, dynamique et motivée, disponible le samedi et le dimanche."],
    ["b5", "EXPÉRIENCE"],
    ["b6", "Vendeuse — Boutique Fictive (prêt-à-porter)"],
    ["b7", "Janv. 2024 – Juin 2024"],
    ["b8", "- Accueil et conseil des clients en boutique, travail en équipe de 5 vendeurs."],
    ["b9", "- Gestion de la caisse et des encaissements."],
    ["b10", "- accueil et conseil des clients en boutique"],
    ["b11", "Baby-sitter — Particuliers"],
    ["b12", "2022 – 2023"],
    ["b13", "- Garde de deux enfants après l'école."],
    ["b14", "COMPÉTENCES"],
    ["b15", "Excel, Canva, relation client"],
    ["b16", "FORMATION"],
    ["b17", "Licence Gestion — Université Fictive"],
  ].map(([id, text]) => ({ id, text }));
  const structure = {
    nameBlockId: "b0",
    headlineBlockId: null,
    contactBlockIds: ["b1", "b2"],
    summaryBlockIds: ["b4"],
    sections: [
      { headingBlockId: "b5", heading: "Expérience", kind: "experience", entries: [{ headerBlockIds: ["b6", "b7"], bulletBlockIds: ["b8", "b9", "b10"] }, { headerBlockIds: ["b11", "b12"], bulletBlockIds: ["b13"] }] },
      { headingBlockId: "b14", heading: "Compétences", kind: "skills", entries: [{ headerBlockIds: [], bulletBlockIds: ["b15"] }] },
      { headingBlockId: "b16", heading: "Formation", kind: "education", entries: [{ headerBlockIds: ["b17"], bulletBlockIds: [] }] },
    ],
  };
  const offerText =
    "Vendeur / Vendeuse en prêt-à-porter – CDI 24h – Lyon. Travail obligatoire le samedi et le dimanche. " +
    "Missions : accueil et conseil client, encaissement, mise en rayon, suivi des stocks. " +
    "Ce que j'apporte : sens du service, travail en équipe, ponctualité. Première expérience en boutique souhaitée.";
  const t0 = Date.now();
  const r = await analyze({ locale: "fr", offerText, resume: { blocks, structure } });
  console.log(`\nDurée : ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log("Conditions :", JSON.stringify(r.offer.conditions));
  console.log("Qualités :", JSON.stringify(r.offer.qualities));
  console.log("Remarques :", JSON.stringify(r.remarks));
  for (const w of r.rewrites) console.log(`- [${w.blockId}] « ${w.before} » → « ${w.after} »${w.flags.length ? `  ⚠ ${w.flags.join(" | ")}` : ""}`);
}, 300_000);
