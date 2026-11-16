# Récupération des offres par lien : résultats des tests réels

Tests faits le 16 novembre 2026 depuis le serveur de production (`/api/offer/fetch`, région Paris),
avec des offres publiques réelles. Les statuts du registre (`lib/offer/platforms.ts`) en découlent.
Pour retester : `LIVE=1 npx vitest run tests/live-offers.test.ts` (les offres expirent : remplacer les liens).

Règles suivies : le site respecte le fichier robots.txt de chaque site et ne contourne aucune
protection anti-robots. Rien n'est deviné : un champ absent est affiché « non trouvé ».

## Récupération complète (poste, entreprise, lieu, contrat, texte)

| Plateforme | Méthode | Résultat |
|---|---|---|
| HelloWork | données structurées | complet |
| Meteojob | données structurées | complet |
| Talent.com | texte de page + titre de la page | complet |
| SNCF (emploi.sncf.com) | données structurées | complet sauf contrat (non publié par le site) |
| Lever | données structurées | complet |
| Teamtailor | données structurées | complet |

## Récupération partielle (texte complet, certains champs absents)

| Plateforme | Méthode | Ce qui manque |
|---|---|---|
| Amazon Jobs | texte de page | entreprise, lieu, contrat |
| Greenhouse | texte de page | entreprise, lieu, contrat |
| SmartRecruiters | microdonnées | lieu |

Non vérifiés faute d'offre ouverte trouvée (les offres testées avaient expiré, et l'expiration a
été correctement détectée) : L'Oréal, Orange, Accor, Decathlon, Lidl, Jobijoba, Workday, Recruitee.
Ils passent par l'extracteur générique ; marqués « partiel » jusqu'à un test réussi.

## Copier-coller nécessaire

| Plateforme | Raison |
|---|---|
| LinkedIn, Indeed | robots.txt interdit la lecture des offres aux robots |
| Welcome to the Jungle, APEC, Monster, Cadremploi, Jooble, JobTeaser, Glassdoor, leboncoin | accès refusé aux robots (403) |
| McDonald's, Carrefour, La Poste (sites carrière) | accès refusé ou indisponible pour les robots |
| France Travail | la description est chargée après l'affichage ; lisible via l'API officielle dès que `FRANCE_TRAVAIL_CLIENT_ID` et `FRANCE_TRAVAIL_CLIENT_SECRET` sont configurés |

## Cas particuliers vérifiés

- Offre expirée (404, 410 ou renvoi vers l'accueil) : « offre introuvable », pas de faux texte.
- Site inconnu avec données structurées : récupéré par l'extracteur générique.
- France Travail sans API : aucun texte d'une autre partie de la page n'est repris.
