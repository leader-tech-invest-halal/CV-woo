import { describe, it } from "vitest";
import fs from "node:fs";

// Essai réel de la lettre de motivation avec 3 offres différentes (CV et offres fictifs).
// Lancé seulement avec LIVE=1 : 3 appels payants à l'IA (clé lue dans .env.local, jamais affichée).
// Les lettres sont écrites dans ../apercu-modeles/lettre-*.txt et leurs PDF à côté.

const student = {
  blocks: [
    ["b0", "Camille Exemple"],
    ["b1", "camille@exemple.fr"],
    ["b2", "06 00 00 00 00"],
    ["b3", "Lyon"],
    ["b4", "Étudiante en licence de gestion, disponible le samedi et le dimanche."],
    ["b5", "EXPÉRIENCE"],
    ["b6", "Vendeuse — Boutique Fictive (prêt-à-porter)"],
    ["b7", "Janv. 2024 – Juin 2024"],
    ["b8", "- Accueil et conseil d'environ 60 clients par jour, au sein d'une équipe de 5 vendeurs."],
    ["b9", "- Encaissement et gestion de la caisse en fin de journée."],
    ["b10", "Baby-sitter — Particuliers"],
    ["b11", "2022 – 2023"],
    ["b12", "- Garde de deux enfants après l'école, aide aux devoirs."],
    ["b13", "COMPÉTENCES"],
    ["b14", "Excel, Canva, relation client"],
    ["b15", "FORMATION"],
    ["b16", "Licence Gestion — Université Fictive (en cours)"],
  ],
  sections: [
    ["b5", "experience", [["b6", "b7"], ["b8", "b9"]], [["b10", "b11"], ["b12"]]],
    ["b13", "skills", [[], ["b14"]]],
    ["b15", "education", [["b16"], []]],
  ],
} as const;

const office = {
  blocks: [
    ["b0", "Sami Exemple"],
    ["b1", "sami@exemple.fr"],
    ["b2", "Villeurbanne"],
    ["b3", "BTS Comptabilité et gestion (en cours), à la recherche d'une alternance."],
    ["b4", "EXPÉRIENCE"],
    ["b5", "Stagiaire administratif — Cabinet Fictif"],
    ["b6", "Mai 2025 – Juin 2025"],
    ["b7", "- Saisie de 200 factures fournisseurs dans le logiciel de comptabilité."],
    ["b8", "- Classement et archivage des dossiers clients, accueil téléphonique."],
    ["b9", "COMPÉTENCES"],
    ["b10", "Excel (tableaux croisés dynamiques), Word, rigueur dans la saisie"],
    ["b11", "FORMATION"],
    ["b12", "BTS Comptabilité et gestion — Lycée Fictif (2024 – 2026)"],
  ],
  sections: [
    ["b4", "experience", [["b5", "b6"], ["b7", "b8"]]],
    ["b9", "skills", [[], ["b10"]]],
    ["b11", "education", [["b12"], []]],
  ],
} as const;

type Fixture = typeof student | typeof office;
function resume(f: Fixture) {
  const blocks = f.blocks.map(([id, text]) => ({ id, text }));
  const sections = f.sections.map(([heading, kind, ...entries]) => ({
    headingBlockId: heading,
    heading: kind,
    kind,
    placement: "main",
    entries: entries.map(([headerBlockIds, bulletBlockIds]) => ({ headerBlockIds: [...headerBlockIds], bulletBlockIds: [...bulletBlockIds] })),
  }));
  return {
    blocks,
    structure: { language: "fr", nameBlockId: "b0", headlineBlockId: null, contactBlockIds: f === student ? ["b1", "b2", "b3"] : ["b1", "b2"], summaryBlockIds: [f === student ? "b4" : "b3"], sections },
  };
}

const CASES = [
  {
    name: "1-vendeuse",
    cv: student,
    offer: {
      title: "Vendeur / Vendeuse en prêt-à-porter",
      company: "Maison Fictive",
      conditions: ["CDI 24h", "Travail obligatoire le samedi et le dimanche", "Lyon"],
    },
    offerText:
      "Maison Fictive recrute un Vendeur / Vendeuse en prêt-à-porter – CDI 24h – Lyon. Travail obligatoire le samedi et le dimanche. " +
      "Missions : accueil et conseil client, encaissement, mise en rayon, suivi des stocks. Ce que j'apporte : sens du service, " +
      "travail en équipe, ponctualité. Première expérience en boutique souhaitée.",
    answers: { motivation: "Le contact avec les clients ; Les horaires conviennent à mes études", asset: "Je peux : Travail obligatoire le samedi et le dimanche ; J'habite près du lieu de travail" },
  },
  {
    name: "2-equipier",
    cv: student,
    offer: { title: "Équipier polyvalent", company: "Burger Fictif", conditions: ["Contrat étudiant 15h", "Soirs et week-ends"] },
    offerText:
      "Burger Fictif recherche un Équipier polyvalent (H/F) en contrat étudiant de 15h par semaine, soirs et week-ends. " +
      "Missions : prise de commande en caisse, préparation des produits, respect des règles d'hygiène, accueil des clients. " +
      "Profil : sourire, esprit d'équipe, rapidité. Débutants acceptés.",
    answers: { motivation: "", asset: "" },
  },
  {
    name: "3-assistant-administratif",
    cv: office,
    offer: { title: "Assistant(e) comptable en alternance", company: null, conditions: ["Alternance 2 ans", "Rythme 3 jours entreprise / 2 jours école"] },
    offerText:
      "Cabinet d'expertise comptable recrute un(e) Assistant(e) comptable en alternance (2 ans), rythme 3 jours en entreprise / 2 jours à l'école. " +
      "Missions : saisie des pièces comptables, rapprochements bancaires, préparation des déclarations de TVA, classement. " +
      "Compétences : maîtrise d'Excel, connaissance d'un logiciel comptable, rigueur, discrétion. Formation BTS CG ou DCG.",
    answers: { motivation: "Apprendre le métier", asset: "Je peux commencer tout de suite" },
  },
];

describe.runIf(process.env.LIVE)("lettre de motivation réelle (3 offres)", () => {
  it.each(CASES)("$name", async ({ name, cv, offer, offerText, answers }) => {
    process.loadEnvFile(".env.local");
    const { generateLetter } = await import("@/lib/ai/letter");
    const { renderLetterPdf } = await import("@/lib/export/letter-pdf");
    const { applyTemplate } = await import("@/lib/export/templates");
    const { DEFAULT_STYLE } = await import("@/lib/cv/types");
    const t0 = Date.now();
    const letter = await generateLetter({ locale: "fr", offerText, offer, resume: resume(cv), accepted: {}, answers });
    const text = [
      ...letter.sender,
      "",
      letter.recipient,
      "",
      letter.placeDate,
      "",
      `Objet : ${letter.subject}`,
      "",
      letter.body,
      "",
      letter.signature,
      "",
      `--- ${letter.words} mots · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
      "POINTS À VÉRIFIER :",
      ...letter.checks.map((c) => `- ${c}`),
    ].join("\n");
    fs.writeFileSync(`../apercu-modeles/lettre-${name}.txt`, text);
    const pdf = await renderLetterPdf(letter, applyTemplate(DEFAULT_STYLE, "encre"));
    fs.writeFileSync(`../apercu-modeles/lettre-${name}.pdf`, pdf.bytes);
    console.log(`\n===== ${name} (${pdf.pages} page) =====\n${text}`);
  }, 300_000);
});
