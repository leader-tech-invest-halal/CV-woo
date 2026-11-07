# CV Woo — Architecture technique (étapes 1 et 2)

> Nom : **CV Woo**. Interface bilingue FR / EN.

## 1. Choix techniques

| Besoin | Choix | Pourquoi |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Front et API dans un seul projet, déploiement natif sur Vercel |
| UI | **Tailwind CSS v4 + shadcn/ui** | Composants accessibles, design sobre facile à personnaliser |
| Traduction | **next-intl** | Routes `/fr/...` et `/en/...`, fichiers de traduction JSON |
| Base de données | **Supabase PostgreSQL** | RLS (Row Level Security) pour isoler les données de chaque utilisateur |
| Authentification | **Supabase Auth** (email + mot de passe, lien magique, Google en option) | Intégré à la RLS |
| Stockage | **Supabase Storage**, buckets **privés** | URLs signées à courte durée de vie |
| IA | **API Anthropic Claude**, appelée **uniquement côté serveur** | La clé n'est jamais envoyée au navigateur |
| Paiement | **Stripe** (Checkout + portail client + webhooks) | Standard, gère abonnements et factures |
| Extraction PDF | **unpdf** (pdf.js adapté au serverless) | Léger, fonctionne sur Vercel |
| Extraction DOCX | **mammoth** | Texte propre à partir de Word |
| Génération PDF | **@react-pdf/renderer** | Texte réel et sélectionnable (lisible par les ATS), pas de navigateur headless |
| Génération DOCX | **docx** (npm) | Fichiers Word natifs, styles de titres standards |
| Validation | **zod** | Valide les formulaires **et** chaque réponse JSON de Claude |
| Déploiement | **Vercel**, région `cdg1` (Paris) | Données au plus près de Supabase en région UE |

### Alternatives écartées
- **Puppeteer / Chrome headless pour le PDF** : trop lourd pour les fonctions Vercel, lent au démarrage. `@react-pdf/renderer` suffit pour des CV une colonne.
- **OCR des PDF scannés** : hors V1. Si un PDF ne contient pas de texte, l'utilisateur reçoit un message clair lui proposant d'importer un DOCX ou de coller son texte.

## 2. Pipeline IA (6 étapes)

Chaque étape est **un appel séparé**, avec un résultat enregistré en base. Si une étape échoue, on relance seulement celle-ci (pas tout le pipeline), et chaque appel reste sous la limite de durée des fonctions Vercel.

| Étape | Route API | Modèle (configurable) | Sortie JSON |
|---|---|---|---|
| 1. Extraction du CV | `POST /api/resumes/[id]/extract` | Haiku (rapide, peu cher) | `ResumeData` : identité, expériences, formations, compétences, langues |
| 2. Analyse de l'offre | `POST /api/offers/[id]/parse` | Haiku | `JobOfferData` : missions, compétences obligatoires/souhaitées, mots-clés, qualifications |
| 3. Comparaison | `POST /api/analyses/[id]/compare` | Sonnet | correspondances avec **preuve** (citation exacte du CV) |
| 4. Recommandations | `POST /api/analyses/[id]/recommend` | Sonnet | sections à améliorer, expériences à valoriser, manques |
| 5. Optimisation | `POST /api/analyses/[id]/optimize` | Sonnet | `ResumeData` réécrit + liste des modifications expliquées |
| 6. Génération | `POST /api/versions/[id]/export?format=pdf\|docx` | — (pas d'IA) | fichier stocké + URL signée |

- **Sortie structurée** : chaque appel utilise un outil (tool use) avec un schéma JSON imposé, puis la réponse est validée par zod. Réponse invalide → une seule nouvelle tentative, puis erreur explicite.
- **Coûts** : *prompt caching* sur les consignes système, `max_tokens` borné par étape, journal de chaque appel (tokens, coût, durée) dans la table `ai_calls`.
- **Erreurs** : 429 / 529 → nouvelle tentative avec délai croissant (3 essais max) ; texte trop long → troncature contrôlée et avertissement à l'utilisateur.

### Garde-fous contre l'invention (règle absolue)
1. **Dans le prompt** : interdiction d'ajouter compétences, diplômes, dates, chiffres ou employeurs absents du CV ; une compétence manquante va dans `missing`, jamais dans le CV.
2. **Traçabilité** : chaque puce réécrite porte l'identifiant (`source_id`) de l'élément du CV d'origine dont elle provient.
3. **Vérification automatique côté serveur** : tout nombre, date, diplôme, certification ou nom d'entreprise présent dans le CV optimisé mais absent du CV d'origine est **signalé** et la modification est bloquée tant que l'utilisateur ne l'a pas validée.

### Score de correspondance
Calculé **par le code**, pas « deviné » par l'IA : pondération des compétences obligatoires (60 %), souhaitées (25 %) et mots-clés (15 %), chacune comptée seulement si l'IA fournit une preuve dans le CV. Le score est donc reproductible. Il s'affiche toujours avec la mention : *« Estimation interne de compatibilité, pas un score ATS officiel. »*

## 3. Sécurité et RGPD

- **Isolation** : RLS activée sur toutes les tables ; un utilisateur ne voit que ses lignes (`user_id = auth.uid()`).
- **Écritures sensibles** (abonnements, quotas, journal IA) : uniquement par le serveur avec la clé `service_role`, jamais exposée au navigateur.
- **Fichiers** : buckets privés, dossier par utilisateur (`<user_id>/...`), URLs signées valables 60 secondes.
- **Validation des imports** : type vérifié par la signature du fichier (pas seulement l'extension), 5 Mo maximum, PDF et DOCX uniquement.
- **Conservation** : durée configurable par l'utilisateur (90 jours par défaut, de 1 à 365). Une tâche planifiée Vercel (cron quotidien) supprime fichiers et lignes expirés.
- **Suppression** : bouton « supprimer ce CV » et « supprimer mon compte » (suppression en cascade + nettoyage du stockage).
- **Hébergement** : Supabase en région UE, fonctions Vercel à Paris.
- **Sous-traitants à citer dans la politique de confidentialité** : Supabase, Vercel, Anthropic, Stripe (vérifier leurs conditions de traitement des données en vigueur au moment du lancement).
- **Limitation d'abus** : quotas vérifiés côté serveur avant chaque appel IA.

## 4. Abonnements

> **Décision (7 nov. 2026) : lancement 100 % gratuit.** Le paiement Stripe sera ajouté plus tard.
> **Maîtrise des coûts IA (option retenue)** : plafond de dépenses mensuel fixé dans la console Anthropic (ex. 10 €), modèle le moins cher utilisé partout où c'est possible, et coupe-circuit dans l'app : si le budget du mois est atteint, les analyses sont suspendues avec un message « revenez le mois prochain ».
> En V1 : quotas gratuits appliqués à tous (pour maîtriser les coûts IA), page « Tarifs » affichant « Bientôt disponible », pas de clé Stripe. Le schéma de base (tables `plans`, `subscriptions`) est déjà prêt pour la suite.

Fonctionnement prévu quand le paiement sera activé :

- Les plans (prix, quotas, modèles disponibles, options) sont stockés dans la table `plans` et **modifiables depuis la page admin** ; l'identifiant de prix Stripe y est lié.
- Stripe Checkout pour souscrire, portail client Stripe pour résilier / changer de carte / télécharger les factures.
- Le webhook `/api/stripe/webhook` (signature vérifiée) met à jour la table `subscriptions`.
- Valeurs de départ (à ajuster) : Free = 1 analyse + 1 génération à vie ; Pro = 20 analyses/mois ; Premium = 60 analyses/mois + lettres de motivation + suivi des candidatures.

## 5. Arborescence du projet

```
cv-match/
├── app/
│   ├── [locale]/
│   │   ├── (marketing)/
│   │   │   ├── page.tsx                 # Landing page
│   │   │   ├── pricing/page.tsx         # Tarifs
│   │   │   └── legal/
│   │   │       ├── privacy/page.tsx     # Politique de confidentialité
│   │   │       └── terms/page.tsx       # CGU
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   ├── (app)/
│   │   │   ├── layout.tsx               # Barre latérale + vérification de session
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── resumes/
│   │   │   │   ├── new/page.tsx         # Import + correction des infos extraites
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── offers/new/page.tsx      # Saisie de l'offre
│   │   │   ├── analyses/[id]/page.tsx   # Résultats de compatibilité
│   │   │   ├── editor/[versionId]/page.tsx  # Éditeur + aperçu + avant/après
│   │   │   ├── history/page.tsx
│   │   │   ├── applications/page.tsx    # Suivi des candidatures (Premium)
│   │   │   ├── profile/page.tsx         # Profil, conservation, suppression du compte
│   │   │   └── billing/page.tsx
│   │   ├── admin/plans/page.tsx         # Édition des tarifs et quotas
│   │   └── layout.tsx
│   ├── api/
│   │   ├── resumes/route.ts             # Upload
│   │   ├── resumes/[id]/extract/route.ts
│   │   ├── offers/route.ts
│   │   ├── offers/[id]/parse/route.ts
│   │   ├── analyses/route.ts
│   │   ├── analyses/[id]/compare/route.ts
│   │   ├── analyses/[id]/recommend/route.ts
│   │   ├── analyses/[id]/optimize/route.ts
│   │   ├── versions/[id]/export/route.ts
│   │   ├── cover-letters/route.ts
│   │   ├── stripe/checkout/route.ts
│   │   ├── stripe/portal/route.ts
│   │   ├── stripe/webhook/route.ts
│   │   ├── account/delete/route.ts
│   │   └── cron/purge/route.ts          # Suppression des documents expirés
│   └── globals.css                      # Design system (tokens)
├── components/
│   ├── ui/                              # Composants shadcn/ui
│   ├── marketing/                       # Hero, avantages, démo, tarifs
│   ├── resume/                          # Formulaires de sections, aperçu
│   ├── analysis/                        # Jauge de score, listes compétences
│   └── diff/                            # Comparaison avant / après
├── lib/
│   ├── ai/
│   │   ├── client.ts                    # Client Anthropic (serveur uniquement)
│   │   ├── prompts/                     # Un fichier par étape
│   │   ├── schemas.ts                   # Schémas zod + JSON des sorties
│   │   ├── guardrails.ts                # Détection des inventions
│   │   └── cost.ts                      # Calcul et journal des coûts
│   ├── parsing/                         # pdf.ts, docx.ts, validate-file.ts
│   ├── scoring.ts                       # Score de correspondance
│   ├── export/
│   │   ├── pdf/templates/               # professionnel, moderne, minimaliste, etudiant
│   │   └── docx/templates/
│   ├── supabase/                        # client navigateur, serveur, admin
│   ├── stripe.ts
│   └── quotas.ts
├── messages/
│   ├── fr.json
│   └── en.json
├── supabase/
│   └── migrations/0001_init.sql         # Schéma de la base (étape 3)
├── middleware.ts                        # Langue + session
├── vercel.json                          # Cron + région
├── .env.example
├── ARCHITECTURE.md
└── DESIGN.md
```

## 6. Variables d'environnement

À saisir dans **Vercel → Settings → Environment Variables**, jamais dans le chat ni dans le code :

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # serveur uniquement
ANTHROPIC_API_KEY=                # serveur uniquement
ANTHROPIC_MODEL_FAST=claude-haiku-5-5
ANTHROPIC_MODEL_SMART=claude-sonnet-5-5
STRIPE_SECRET_KEY=                # commencer avec la clé de test sk_test_...
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=
CRON_SECRET=
```

## 7. Suite du développement

5. Landing page + dashboard → 6. Import et extraction → 7. Analyse des offres → 8. Connexion Claude → 9. Éditeur et exports → 10. Auth, abonnements, sécurité → 11. Tests.
Chaque étape = une branche GitHub + un déploiement de prévisualisation Vercel à vérifier avant de passer à la suivante.
