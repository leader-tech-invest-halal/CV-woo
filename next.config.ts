import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

// En-têtes de sécurité sur toutes les pages et routes :
// - le site ne peut pas être affiché dans un cadre sur un autre site (protection « clickjacking ») ;
// - le navigateur ne devine pas le type d'un fichier ; pas de plugins ; formulaires vers le site uniquement ;
// - l'adresse complète n'est pas transmise aux autres sites ; caméra, micro et localisation désactivés.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // Bibliothèques Node lourdes : chargées telles quelles côté serveur
  serverExternalPackages: ["@react-pdf/renderer", "unpdf", "docx", "pdf-lib"],
  // Polices intégrées aux PDF générés (lues sur le disque par la route d'export)
  outputFileTracingIncludes: {
    "/api/export": ["./node_modules/@fontsource/*/files/*-latin-400-normal.woff", "./node_modules/@fontsource/*/files/*-latin-700-normal.woff",
      // Polices intégrées du moteur PDF, chargées dynamiquement (non détectées automatiquement)
      "./node_modules/pdfkit/js/standard-fonts/**",
    ],
  },
};

export default withNextIntl(nextConfig);
