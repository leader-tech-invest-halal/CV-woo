import { DEFAULT_STYLE, type Block, type ResumeStructure, type ResumeStyle } from "@/lib/cv/types";

// CV fictif structuré (aucune donnée réelle), prêt à être exporté.

export function makeCv({ experiences, bullets, sidebar = false }: { experiences: number; bullets: number; sidebar?: boolean }) {
  const blocks: Block[] = [];
  const add = (text: string) => {
    const id = `b${blocks.length}`;
    blocks.push({ id, text });
    return id;
  };
  const name = add("Camille Exemple");
  const headline = add("Développeuse web");
  const contacts = [add("camille@exemple.fr"), add("06 00 00 00 00"), add("Lyon")];
  const summary = [add("Développeuse web curieuse et rigoureuse, je conçois des applications accessibles et rapides avec les équipes produit.")];
  const place = sidebar ? ("sidebar" as const) : ("main" as const);
  const sections: ResumeStructure["sections"] = [
    {
      headingBlockId: add("EXPÉRIENCE"),
      heading: "Expérience",
      kind: "experience",
      placement: "main",
      entries: Array.from({ length: experiences }, (_, i) => ({
        headerBlockIds: [add(`Développeuse web — Société Fictive ${i + 1}`), add(`Janv. 20${10 + i} – Déc. 20${10 + i} · Lyon`)],
        bulletBlockIds: Array.from({ length: bullets }, (_, j) =>
          add(`- Mission ${i + 1}.${j + 1} : développement d'une fonctionnalité React avec l'équipe produit et revue de code.`),
        ),
      })),
    },
    {
      headingBlockId: add("FORMATION"),
      heading: "Formation",
      kind: "education",
      placement: "main",
      entries: [
        { headerBlockIds: [add("Licence Informatique — Université Fictive"), add("2020 – 2023")], bulletBlockIds: [] },
        { headerBlockIds: [add("Certification Accessibilité numérique"), add("2023")], bulletBlockIds: [] },
      ],
    },
    {
      headingBlockId: add("COMPÉTENCES"),
      heading: "Compétences",
      kind: "skills",
      placement: place,
      entries: [{ headerBlockIds: [], bulletBlockIds: ["JavaScript, TypeScript, React", "HTML, CSS, Figma", "Git, tests automatisés"].map(add) }],
    },
    {
      headingBlockId: add("LANGUES"),
      heading: "Langues",
      kind: "languages",
      placement: place,
      entries: [{ headerBlockIds: [], bulletBlockIds: ["Français : langue maternelle", "Anglais : B2"].map(add) }],
    },
  ];
  const structure: ResumeStructure = {
    language: "fr",
    nameBlockId: name,
    headlineBlockId: headline,
    contactBlockIds: contacts,
    contactHeadingBlockId: null,
    summaryBlockIds: summary,
    sections,
  };
  const style: ResumeStyle = sidebar
    ? { ...DEFAULT_STYLE, layout: "sidebar-left", sidebarColor: "#0f3d33" }
    : DEFAULT_STYLE;
  return { blocks, structure, style, accepted: {} as Record<string, string> };
}
