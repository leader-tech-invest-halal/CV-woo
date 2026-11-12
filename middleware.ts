import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Langue (/fr, /en). La vérification de session sera ajoutée à l'étape 10.
export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\..*).*)",
};
