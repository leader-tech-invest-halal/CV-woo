import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Bibliothèques Node lourdes : chargées telles quelles côté serveur
  serverExternalPackages: ["@react-pdf/renderer", "unpdf", "docx", "pdf-lib"],
  // Polices intégrées aux PDF générés (lues sur le disque par la route d'export)
  outputFileTracingIncludes: {
    "/api/export": ["./node_modules/@fontsource/*/files/*-latin-400-normal.woff", "./node_modules/@fontsource/*/files/*-latin-700-normal.woff"],
  },
};

export default withNextIntl(nextConfig);
