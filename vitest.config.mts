import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests automatiques : fonctions du serveur (lecture des CV, garde-fous, score, quotas).
// Aucun appel réseau, aucune clé : l'IA et la base de données sont simulées.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // « server-only » interdit l'import côté navigateur ; inutile dans les tests
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
  },
});
