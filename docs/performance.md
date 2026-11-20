# Performance

Budgets de performance du site, mesurés sur le jeu national (8 168 parcours, 111 établissements)
avec un build de production (`make prod-local`, `next build` puis son serveur standalone, sur la base de
développement). « Avant » / « après » : avant et après le travail sur la pagination et les caches
(novembre 2026). Dernières mesures brutes : `docs/perf/latest.json`, `docs/perf/latest-vitals.json`.

## Méthode

- `make perf` (`scripts/perf.mjs`) : 40 requêtes séquentielles par route après une requête de
  chauffe ; temps jusqu'au premier octet (TTFB) p50 / p95 / p99, temps de réponse complet p95, poids
  HTML, JavaScript chargé au premier affichage (scripts de la page, compressés en gzip).
  `--assert` échoue si un budget est dépassé.
- `make vitals` (`scripts/web-vitals.mjs`) : Chromium, profil mobile 390 × 844 (DPR 2), 4G simulée
  (150 ms, 1,6 Mb/s), processeur ralenti 4 fois ; LCP, puis INP sur une interaction typique
  (saisie dans le champ de recherche, sinon clic sur un bouton). INP = interactions seulement
  (`interactionId`), comme la définition officielle. Médiane de 3 passages.
- `make lhci` : Lighthouse CI sur les mêmes pages (`lighthouserc.json`), échec du build si un budget
  est dépassé. Nécessite le téléchargement de `@lhci/cli` : non lancé dans cet environnement.
- Poste de mesure : WSL 2 + Docker, base et serveur sur la même machine. Les écarts entre passages
  vont jusqu'à ±30 % : les chiffres valent pour les ordres de grandeur.

Avant le lot, Explorer et les fiches envoyaient leur première partie tout de suite puis
streamaient le reste : leur TTFB était trompeur. Le tableau compare donc le **temps de réponse
complet** (p95), qui est ce qu'attend le visiteur.

## Budgets

| Mesure                                             | Budget                       | Avant                        | Après                                                                   |                  |
| -------------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------------------------------- | ---------------- |
| Accueil (sans recherche)                           | < 300 ms                     | 3 034 ms · 31 Mo de HTML     | 125 ms · 126 Ko                                                         | ✅               |
| Accueil, recherche « droit »                       | < 300 ms                     | 2 243 ms · 18 Mo             | 83 ms · 124 Ko                                                          | ✅               |
| Explorer                                           | < 300 ms                     | 2 034 ms · 29 Mo             | 113 ms · 446 Ko                                                         | ✅               |
| Explorer, 4 filtres                                | < 300 ms                     | 1 182 ms · 10 Mo             | 241 ms · 272 Ko                                                         | ✅               |
| Explorer, page 2                                   | < 300 ms                     | 1 825 ms (pas de page 2)     | 127 ms                                                                  | ✅               |
| Fiche parcours                                     | < 300 ms                     | 822 ms                       | 96 ms                                                                   | ✅               |
| Fiche mention Droit                                | < 300 ms                     | 752 ms                       | 110 ms                                                                  | ✅               |
| Fiche mention MEEF 2d degré (856 parcours)         | < 300 ms                     | 897 ms · 2,4 Mo              | 231 ms · 595 Ko                                                         | ✅               |
| Fiche université UVSQ                              | < 300 ms                     | 892 ms                       | 71 ms                                                                   | ✅               |
| Page publique en cache : À propos                  | < 100 ms                     | 15 ms                        | 51 ms                                                                   | ✅               |
| Page publique en cache : index des mentions        | < 100 ms                     | 65 ms · 782 Ko               | 74 ms · 246 Ko                                                          | ✅               |
| Suggestions « patrimoine nantes »                  | < 80 ms                      | 803 ms                       | 43 ms                                                                   | ✅               |
| Suggestions « dro »                                | < 80 ms                      | 868 ms                       | 34 ms                                                                   | ✅               |
| Palette « rncp 42684 »                             | < 80 ms                      | 832 ms                       | 60 ms                                                                   | ✅               |
| Affichage des suggestions après la dernière frappe | < 150 ms après l'anti-rebond | n.m.                         | ≈ 75–90 ms (≈ 195–215 ms avec les 120 ms d'anti-rebond, serveur de dev) | ✅               |
| LCP mobile, accueil                                | < 2,5 s                      | 5 256 ms                     | 1 244 ms                                                                | ✅               |
| LCP mobile, Explorer avec filtres                  | < 2,5 s                      | 1 308 ms                     | 1 228 ms                                                                | ✅               |
| LCP mobile, fiche parcours                         | < 2,5 s                      | 1 500 ms                     | 1 284 ms                                                                | ✅               |
| LCP mobile, À propos                               | < 2,5 s                      | 1 212 ms                     | 1 236 ms                                                                | ✅               |
| INP, accueil (saisie)                              | < 200 ms                     | 2 696 ms                     | 48 ms                                                                   | ✅               |
| INP, Explorer (saisie)                             | < 200 ms                     | 680 ms                       | < 16 ms                                                                 | ✅               |
| INP, fiche parcours                                | < 200 ms                     | 40 ms                        | 40 ms                                                                   | ✅               |
| INP, À propos                                      | < 200 ms                     | 88 ms                        | 96 ms                                                                   | ✅               |
| JavaScript au premier chargement                   | < 150 Ko gz                  | 195–200 Ko                   | 196–204 Ko                                                              | ❌ voir plus bas |
| Requêtes SQL des pages publiques                   | < 50 ms p95, pas de N+1      | jusqu'à ≈ 600 ms (recherche) | voir plus bas                                                           | ⚠️               |

À propos et l'index des mentions sont un peu plus lents qu'avant : ils portent désormais le pied
de page (chiffres de la base en cache, session lue pour « Mon espace / Se connecter »), et l'index
fait son tri et ses compteurs en base au lieu de tout envoyer.

## Requêtes SQL

`pg_stat_statements` est chargé ; en dev, les requêtes de plus de 100 ms sont journalisées.

| Requête                                       | Avant                       | Après                |
| --------------------------------------------- | --------------------------- | -------------------- |
| Liste Explorer (une page, avec le total)      | catalogue entier en mémoire | 4–30 ms p50          |
| Recherche par code (UAI de Nantes)            | ≈ 600 ms                    | 45 ms p50            |
| Recherche par code (RNCP)                     | ≈ 600 ms                    | 18 ms p50            |
| Compteurs de toutes les facettes, sans filtre | n.a.                        | 85–140 ms hors cache |
| Compteurs, recherche « droit »                | n.a.                        | 22–37 ms             |

- **Pas de N+1** : `tests/unit/query-count.test.ts` compte les requêtes (Explorer : 1 pour la page,
  quelle que soit sa taille, 1 pour toutes les facettes ; vue groupée : 2 ; recherche : le même
  nombre pour 7 ou 1 000 parcours ; comparateur : le même nombre pour 1 ou 3 parcours).
- **Le budget de 50 ms n'est pas tenu par les compteurs de facettes hors cache** quand le filtre
  garde presque tout le catalogue (85–140 ms : 15 agrégations sur ≈ 7 600 lignes, chacune avec les
  filtres des autres groupes). Une seule passe en `GROUPING SETS` a été essayée : correcte mais plus
  lente. Les compteurs sont donc servis depuis un cache de 60 s par combinaison de paramètres,
  recalculé pour la combinaison sans filtre dès qu'une publication expire le cache ; en usage
  courant la requête ne tourne qu'au premier visiteur d'une combinaison.
- Index ajoutés (`20261114130000_identifier_prefix`, `20261114140000_performance`) : préfixes
  d'identifiants (`text_pattern_ops`), région en slug, avis par parcours et date, curseurs du journal
  et de l'audit, suivis, messages non lus, signalements ouverts, alertes, provenance.

## JavaScript

≈ 197 Ko compressés au premier chargement d'une page publique, dont ≈ 160 Ko pour le cadre
(react-dom 72 Ko, routeur et runtime Next 48 Ko, React 39 Ko) et ≈ 38 Ko pour le site (en-tête,
palette ⌘K, pied de page, thème, Turnstile). Le budget de 150 Ko n'est pas atteignable sans
changer de cadre. Ce qui a baissé, c'est la charge de rendu : l'accueil n'hydrate plus 8 000 lignes,
Explorer plus 8 000 cartes, la palette et le formulaire d'avis ne reçoivent plus le catalogue.

Mesure : `scripts/perf.mjs` additionne toutes les balises `<script src>` de la page, polyfill
`noModule` compris (≈ 39 Ko, que les navigateurs récents ne téléchargent pas) : c'est la même
méthode depuis le début, les chiffres restent comparables.

### Régression de novembre 2026 (228 Ko au lieu de 197)

Le job `build-budget` de la première CI du dépôt public a échoué : toutes les pages, même la
page 404, dépassaient 215 Ko. Le surplus (≈ 31 Ko compressés) était dans le JavaScript commun, et déjà là
dans le premier commit de l'historique conservé (il date d'avant la publication) :

- **`components/ui/index.ts`** : un barrel (`export *`) importé par plus de quatre-vingts fichiers, dont une cinquantaine de composants
  client. Turbopack ne l'élague pas : un seul `import { Button } from '@/components/ui'` dans
  l'en-tête embarquait toute la bibliothèque (formulaire d'avis, saisie du code, fichiers,
  bulles de messages…) sur chaque page. Les barrels sont supprimés et interdits par ESLint
  (`no-restricted-imports`).
- **`zod`** : le bandeau d'information (`SiteBanner`, composant client du
  layout public) importait `lib/domain/banner.ts`, qui construisait aussi le schéma du formulaire
  d'administration. Le schéma vit maintenant dans `lib/domain/banner-schema.ts`.
- Les modules serveur qui lisent la base sans passer par un autre garde-fou importent
  `server-only` : une fuite vers un composant client casse le build au lieu d'alourdir le site.

Après correction : 184 Ko pour la page 404, 187–196 Ko pour les pages publiques, 205 Ko pour la
fiche parcours. `make budget` refait la mesure de la CI en local, `make analyze` liste les modules
les plus lourds (analyse Turbopack : `@next/bundle-analyzer` ne lit que les builds webpack).

## Ce qui a été fait

- Listes paginées côté serveur, sur une table dénormalisée (`ProgramSearchIndex`) : plus aucune
  page ne charge le catalogue entier (accueil, Explorer, fiches, comparateur, formulaire d'avis).
- Cache de données de 60 s par combinaison de paramètres (accueil, Explorer, facettes, vue
  groupée, index, suggestions), tag `catalog` expiré à chaque publication et à chaque avis ;
  pied de page en cache 1 h (tag `footer-stats`).
- Suggestions : anti-rebond de 120 ms, requête précédente annulée, réponses récentes gardées en
  mémoire, `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` sans session.
- Préchargement des fiches au survol ou au focus d'un résultat de la palette ; les liens des
  listes sont des `next/link` (préchargés quand ils sont visibles).
- Polices auto-hébergées par `next/font` (Bricolage Grotesque et Inter, sous-ensemble latin,
  `display: swap`) : aucune requête vers Google Fonts.
- Script Turnstile chargé quand le formulaire devient visible.
- Pool de connexions séparé site / worker, `statement_timeout` côté site.
- Règles Cloudflare, à poser dans le tableau de bord : cache des pages publiques anonymes
  seulement avec `CDN_CACHE_PUBLIC=true` (le site envoie alors `Cloudflare-CDN-Cache-Control:
public, max-age=60, stale-while-revalidate=300`), contournement du cache pour `/espace*`,
  `/admin*`, `/api/*` et les Server Actions. Désactivé par défaut : une page HTML mise en cache
  sert le même nonce CSP à tous les visiteurs.

## Accueil (recherche guidée, novembre 2026)

Mesuré sur le jeu national, build de production (`make prod-local`), avant / après la nouvelle
accueil. Lighthouse : mobile simulé, médiane de 3 passages ; « mesuré » : `scripts/web-vitals.mjs`.

| Mesure                           | Avant         | Après       |
| -------------------------------- | ------------- | ----------- |
| TTFB p95 (`perf.mjs`, 40 req.)   | 33 ms         | 31 ms       |
| HTML                             | 127 Ko        | 115 Ko      |
| JavaScript au premier affichage  | 187 Ko        | 186 Ko      |
| Suggestions p95 (`/api/suggest`) | —             | 11–14 ms    |
| LCP mesuré / INP mesuré          | 1 008 / 40 ms | 980 / 72 ms |
| Lighthouse Performance           | 77            | 90          |
| LCP simulé                       | 2,45 s        | 2,42–3,18 s |
| CLS                              | 0,026         | 0,026       |
| TBT simulé                       | 880 ms        | 188 ms      |
| Lighthouse SEO                   | 100           | 100         |

- Tout ce qui est visible est rendu par le serveur ; le seul îlot client est le formulaire. Les
  suggestions et le sélecteur de ville sont chargés par `import()` à la première interaction.
- Le formulaire fonctionne sans JavaScript (liste et cases natives, rendues par le serveur).
- Les liens de l'accueil, de l'en-tête et du pied de page ne préchargent leur page qu'au survol, au
  focus ou au toucher (`HoverLink`), plus quand ils deviennent visibles.
- Le jeu complet d'icônes n'est plus dans le JavaScript commun à toutes les pages : l'en-tête, le
  pied de page et les notifications n'en importent que les quelques glyphes qu'ils dessinent
  (`components/ui/glyphs.ts`), et les classes de bouton sont séparées du composant `Button`.
- Non tenu en local : Performance ≥ 95, LCP simulé < 2 s, TBT < 150 ms. Le LCP (le titre H1) est
  retardé à 80 % par la feuille de style globale, bloquante (24 Ko gz, toutes les pages), et le TBT
  vient du runtime React. Le LCP réellement mesuré est de 1 s.
