# CV Woo — Design system (étape 4)

Les valeurs exactes sont dans `app/globals.css`. Ce fichier explique comment les utiliser.

## 1. Couleurs

| Rôle | Valeur | Usage |
|---|---|---|
| Fond | Blanc | Pages, cartes |
| Surface | Gris très clair (léger reflet vert) | Fond du dashboard, zones secondaires |
| Texte | Noir profond | Titres et corps de texte |
| Texte secondaire | Gris foncé (contraste AA) | Légendes, aides |
| **Accent** | **Vert émeraude 600** | Boutons principaux, liens, focus, score |
| Accent survol | Émeraude 700 | Survol des boutons |
| Fond d'accent | Émeraude 50 | Badges « compétence présente » |
| Avertissement | Ambre | Compétence « non démontrée » |
| Erreur | Rouge | Erreurs, suppression |

Règle : **un seul bouton émeraude par écran** (l'action principale). Les autres sont en contour ou en texte.

## 2. Typographie

- Interface : **Geist Sans** (chargée via `next/font`), chiffres tabulaires pour les scores et les prix.
- Échelle : 12 / 14 / 16 (corps) / 20 / 24 / 32 / 48 px (titre de la landing).
- Graisses : 400 corps, 500 libellés, 600 titres. Pas de 700+ sauf le titre principal.
- Interligne : 1,5 pour le corps, 1,2 pour les titres.

## 3. Espacements, formes, ombres

- Grille de 4 px ; espacements courants : 8, 12, 16, 24, 32, 48.
- Rayon des cartes : 10 px ; boutons et champs : 8 px ; badges : arrondi complet.
- Ombre unique, très légère (`shadow-card`) ; bordure fine grise sur les cartes.
- Largeur de contenu : 1120 px max (landing), 960 px (pages de l'app).

## 4. Composants (shadcn/ui)

Button, Input, Textarea, Label, Card, Badge, Tabs, Dialog, Sheet (menu mobile), DropdownMenu, Progress, Skeleton, Toast (Sonner), Tooltip, Separator, Switch, Select.

Composants maison :
- **ScoreGauge** : cercle de progression émeraude + chiffre + mention « Estimation interne ».
- **SkillChip** : présente (émeraude), non démontrée (ambre), absente (gris).
- **StepIndicator** : CV → Offre → Analyse → Éditeur.
- **DiffView** : avant / après côte à côte sur ordinateur, onglets sur mobile ; suppressions barrées, ajouts surlignés en émeraude 50, explication sous chaque modification.
- **FileDropzone** : glisser-déposer + bouton, formats et taille max affichés.

## 5. Icônes et animations

- Icônes : **Lucide** (trait 1,5 px, taille 16 ou 20 px).
- Animations : fondu + léger glissement (150–200 ms), squelettes de chargement, aucune animation en boucle. Respect de `prefers-reduced-motion`.

## 6. Responsive

- Mobile d'abord : une colonne, barre de navigation en bas sur l'app, zones tactiles de 44 px minimum.
- Tablette (≥ 768 px) : barre latérale repliable.
- Ordinateur (≥ 1024 px) : barre latérale fixe ; éditeur en deux colonnes (formulaire | aperçu).

## 7. Modèles de CV (règles ATS)

Valables pour les 4 modèles (Professionnel, Moderne, Minimaliste, Étudiant) :
- **Une seule colonne**, ordre de lecture linéaire.
- Titres de sections standards : *Expérience professionnelle, Formation, Compétences, Langues* (EN : *Experience, Education, Skills, Languages*).
- Polices standards intégrées au PDF (texte sélectionnable), corps 10–11 pt.
- Aucun tableau, aucune jauge de compétences, aucune icône dans le contenu, aucune image de fond.
- Coordonnées dans le corps du document (pas dans l'en-tête ou le pied de page Word).
- Dates au même format partout (ex. « 09/2024 – 06/2025 »).

Différences entre modèles : seulement la police, la couleur des titres (noir ou émeraude foncé), les filets de séparation et l'espacement. Le modèle Étudiant place la formation avant l'expérience.
