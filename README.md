# CV Woo

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
