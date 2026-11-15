# CV Woo

Site en ligne : https://cv-woo.vercel.app (bêta)

SaaS qui adapte un CV à une offre d'emploi grâce à l'IA, sans jamais inventer d'informations.

- Architecture : [ARCHITECTURE.md](ARCHITECTURE.md)
- Design system : [DESIGN.md](DESIGN.md)
- Base de données : [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql)

Stack : Next.js · TypeScript · Tailwind · shadcn/ui · Supabase · API Claude · Vercel.

## Lancer le projet en local

```bash
npm install
npm run dev
```

Puis ouvrir http://localhost:3000 (redirige vers `/fr`). Pages disponibles : accueil, `/fr/pricing`, `/fr/dashboard` (et leurs versions `/en/...`).

## Tests automatiques

```bash
npm test
```

61 tests, sans réseau ni clé (l'IA et la base de données sont simulées), avec des CV fictifs fabriqués à la volée :

- `tests/guardrails.test.ts` : garde-fous « ne jamais inventer » (chiffres, outils, sigles, compétences manquantes) et preuves des compétences ;
- `tests/scoring.test.ts` : score de correspondance (poids 60 / 25 / 15) ;
- `tests/parsing.test.ts` : type de fichier, lecture des PDF (paragraphes recollés, puces séparées, PDF scanné refusé) et des Word (réécriture qui garde la mise en forme) ;
- `tests/access.test.ts` : essai gratuit sans compte, cookie signé, quota de 5 adaptations par mois ;
- `tests/export-layout.test.ts` : mise en page de l'export (une page en mode compact quand c'est possible, deux pages lisibles sinon, aucun texte perdu, Word aligné sur le PDF).
- `tests/ats-readiness.test.ts` : contrôle ATS « avant / après » sur les fichiers exportés (PDF et Word), sans IA.
- `tests/enrich.test.ts` : « Enrichir mon profil » (seules les réponses confirmées sont intégrées, rien d'inventé, jamais une compétence « similaire » écrite comme acquise).

Ils sont relancés automatiquement par GitHub à chaque envoi (`.github/workflows/tests.yml`).
