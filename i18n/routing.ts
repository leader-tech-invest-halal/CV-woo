import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  // Le français est toujours la langue par défaut, quelle que soit la langue du navigateur.
  // Le choix de l'anglais reste possible avec le sélecteur de langue (mémorisé ensuite).
  localeDetection: false,
});
