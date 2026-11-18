# Référencement du site public : audit avant / après

17/11/2026. Mesures sur un build de production local (`make prod-local`, `APP_URL=http://localhost:3002`) branché sur la base de développement, qui porte les données nationales : 8 villes ouvertes, 1 548 fiches publiées. Il n’y a pas de préproduction : la même vérification se relance sur notetonmaster.fr après le déploiement (`mise-en-ligne.md`).

- Pages : `pnpm seo:check -- --audit=…` (titre, description, h1, canonique, robots, JSON-LD, poids JS compressé des scripts de la page). Données brutes : `data/avant-pages.json`, `data/apres-pages.json`.
- Site entier : `pnpm seo:check -- --url=…` (sitemap, puis toutes les pages indexables atteintes par un lien). Rapport : `data/check-apres.json`.
- Lighthouse 12.8.2, mobile (4G simulée, CPU ×4), médiane de 3 exécutions : `data/lighthouse.json`. La colonne SEO exclut l’audit `is-crawlable`, en échec volontaire hors production (`noindex` partout).

## Avant

| Type de page                              | `title`                                                                       | Description | `h1` | Canonique            | Indexation                          | JSON-LD | JS (Ko gz) | Lighthouse Perf / SEO / Access. |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ----------- | ---- | -------------------- | ----------------------------------- | ------- | ---------- | ------------------------------- |
| Accueil                                   | « notetonmaster · La brochure promet, les étudiant·es racontent. »            | 135 car.    | 1    | oui                  | indexée                             | aucun   | 229        | 83 / 100 / 100                  |
| Accueil avec recherche `?q=droit`         | identique à l’accueil                                                         | identique   | 1    | elle-même            | **indexée**                         | aucun   | 229        | –                               |
| Explorer                                  | « Explorer les masters à 8 villes · notetonmaster »                           | 115 car.    | 1    | oui                  | indexée                             | aucun   | 238        | 84 / 100 / 100                  |
| Explorer filtré                           | identique à Explorer                                                          | identique   | 1    | elle-même            | **indexée**                         | aucun   | 238        | –                               |
| Fiche parcours (avec avis)                | « Valorisation des nouveaux patrimoines · Nantes Université · … »             | 161 car.    | 1    | **aucune**           | indexée, **titre dans le `<body>`** | aucun   | 242        | 84 / 83 / 100                   |
| Fiche sans avis ni programme              | « Sciences analytiques · Université de Strasbourg · … »                       | 129 car.    | 1    | **aucune**           | indexée, titre dans le `<body>`     | aucun   | 242        | 87 / 83 / 100                   |
| Fiche `?onglet=programme`                 | identique à la fiche                                                          | identique   | 1    | **aucune** (doublon) | indexée                             | aucun   | 242        | –                               |
| Fiche inconnue                            | « Parcours introuvable »                                                      | –           | 0    | –                    | **statut 200** (page vide)          | –       | –          | –                               |
| `/mentions`, `/universites`               | « Les mentions de master · … »                                                | 124 car.    | 1    | oui                  | indexée (filtres aussi)             | aucun   | 234        | –                               |
| Fiche mention                             | « Master Droit · notetonmaster »                                              | 94 car.     | 1    | **aucune**           | indexée (filtres aussi)             | aucun   | 238        | 95 / 100 / 100                  |
| Fiche université                          | « Nantes Université · notetonmaster »                                         | 78 car.     | 1    | **aucune**           | indexée (filtres aussi)             | aucun   | 238        | –                               |
| Page ville                                | **n’existait pas**                                                            |             |      |                      |                                     |         |            |                                 |
| À propos, pages légales                   | « À propos · notetonmaster », « Charte de modération · … »                    | 87 / 124    | 1    | **aucune**           | indexées                            | aucun   | 228–230    | –                               |
| `/comparer`, connexion, formulaire d’avis | « Comparer des parcours · … », « Se connecter · … »                           | –           | 1    | aucune               | **indexées**                        | aucun   | 230–240    | –                               |
| `robots.txt`                              | **404**                                                                       |             |      |                      |                                     |         |            |                                 |
| `sitemap.xml`                             | un seul fichier, sans `lastmod`, avec `/explorer` mais sans les pages légales |             |      |                      |                                     |         |            |                                 |

Autres constats :

- Next.js envoyait `<title>` et la description **dans le `<body>`** des fiches (métadonnées en streaming), y compris pour Googlebot : Lighthouse SEO 83 sur les fiches (« pas de meta description »).
- `/Explorer` → 404, `/explorer/` → 308 : pas de forme canonique cohérente. Pas de redirection www / .com / http.
- Aucune image de partage propre à une page : la même image pour tout le site.
- LCP simulé ≈ 4 s, LCP réel 0,5 à 0,8 s : la page entière (et les cartes) apparaissait par un fondu partant de l’opacité 0, que Chrome ne compte qu’une fois le JavaScript exécuté.
- Liens de pagination en `rel="prev"` / `rel="next"` (ignorés par Google).

## Ce qui a été fait

### 1. Domaine, URL, canoniques

- `lib/seo/site.ts` : l’origine vient de `APP_URL`, lue à l’exécution. Production = exactement `https://notetonmaster.fr`.
- `proxy.ts` : 301 de www, notetonmaster.com et http vers `https://notetonmaster.fr` (même chemin, mêmes paramètres) ; 301 des majuscules (rubriques publiques seulement, jamais les jetons) et de la barre oblique finale (`skipTrailingSlashRedirect`, la règle est la même partout).
- Hors production : `X-Robots-Tag: noindex, nofollow` sur toutes les réponses et `robots.txt` qui interdit tout.
- Canonique absolue sur chaque page publique (`lib/seo/meta.ts`), construite depuis `APP_URL`.
- Slugs : déjà en minuscules sans accents. Les anciens slugs de fiches (homonymes renommés) répondent 301 par la table existante `ProgramSlugRedirect`, désormais lue pour tout slug inconnu (avant : seulement les slugs numérotés). Les slugs de mention et d’université ne changent jamais dans le code actuel : pas de nouvelle table. Aucune route existante n’a changé.

### 2. Indexation

- Indexées : accueil, fiches parcours publiées (établissements publics, villes ouvertes), fiches mention et université avec au moins un parcours publié, `/mentions`, `/universites`, `/explorer` sans paramètre, pages ville, À propos, pages légales.
- `noindex, follow` : accueil et Explorer avec un paramètre quelconque (recherche, filtre, tri, page) ; variantes filtrées ou triées des mentions, universités et des avis d’une fiche (canonique vers la page sans filtre) ; `/comparer`.
- `noindex, nofollow` + `Disallow` : `/espace`, `/admin`, `/connexion`, `/avis/…`, `/signaler`, `/reponse…`, `/messages`, `/api`.
- Pagination : chaque page a sa canonique (`/mentions/droit?page=2`), les liens sont de vrais `<a href>`, les `rel=prev/next` sont retirés.
- Statuts, tous décidés dans `proxy.ts` avant le rendu (404 rendue côté serveur, avec son `h1`) : fiche, mention ou université inconnue ou dépubliée → **404** ; publiée mais hors des villes ouvertes → 404 « Pas encore sur notetonmaster » ; ville fermée ou inconnue, ville × mention de moins de 2 parcours → 404 ; `/calendrier.ics` → 410 ; `/carte`, `/calendrier` → 301. L’écran de chargement de la fiche est retiré.
- Fiches sans avis ni programme : toujours indexées. Leur HTML initial contient la fiche d’identité, la section Admission calculée (onglet), « Même mention, ailleurs », et en haut de page « Pas encore d’avis — Tu as suivi ce master ? Donne le premier avis ».

### 3. Titres, descriptions, contenu

Calculés à partir des données (`lib/seo/titles.ts`, testés) :

- Fiche : `Master {Parcours} – {Université} ({Ville}) : avis et programme | notetonmaster`, raccourci jusqu’à tenir (60 visés, 70 au plus) : « et programme », puis « : avis », puis l’université en forme courte (« Univ. Montpellier Paul-Valéry »), puis la ville seule. Le nom du parcours n’est coupé qu’en dernier, au milieu et en gardant les mots qui le distinguent de ses voisins (« Études arabes… » / « Études russes… »).
- Homonymes (même titre, même établissement ou même ville) : un qualificatif factuel, le premier qui leur est propre : établissement, « alternance », « entrée en M2 », campus, puis numéro Mon Master (`lib/catalog/homonyms.ts`).
- Description : « 4,1/5 sur 12 avis d’étudiant·es. Programme semestre par semestre, admission et parcours similaires à Nantes. » ; sans avis : « … Sois le ou la premier·e à donner ton avis. » Elle ne mentionne jamais un programme absent.
- Mention : `Master {Mention} : {n} parcours à {villes}`, université : `Masters à {Université} : {n} parcours et avis`, ville : `Masters à {Ville} : {n} parcours, avis d’étudiant·es`, ville × mention : `Masters de {mention} à {Ville} : {n} parcours et avis`.
- Rédigés à la main (à valider). Les nombres de villes, de mentions et d’établissements y sont calculés à chaque affichage ; ceux cités ici sont le rendu du 17/11/2026 :
  - Accueil : « Avis sur les masters, programmes et admission | notetonmaster » — « Avis d’étudiant·es, programmes et admission de chaque parcours de master des universités publiques dans 8 villes. Compare, puis donne ton avis. »
  - `/mentions` : « Les mentions de master : parcours et avis | notetonmaster » — « Les 218 mentions de master proposées dans 8 villes, de l’informatique au droit : parcours, villes et note moyenne des avis d’étudiant·es. »
  - `/universites` : « Universités et écoles : leurs masters et avis | notetonmaster » — « Les 18 universités et établissements publics qui proposent un master dans 8 villes : parcours, mentions et avis d’étudiant·es. »
  - À propos : « À propos : sources, modération et contact | notetonmaster » — « Qui fait notetonmaster, d’où viennent les données (Mon Master, France compétences, sites des universités), comment un avis est relu, et comment nous écrire. » InserSup est retiré du site public (À propos, comparateur, pied de page, mentions légales) : il n’a pas de connecteur réel (seulement le connecteur de démonstration), rien n’en est importé en production.
  - Pages légales : une description par document.
- Un seul `h1` par page, plus de saut de niveau (un `h2` « Filtres » masqué dans Explorer, avant les groupes de filtres en `h3`).
- **Onglets de la fiche (solution retenue, la plus simple)** : les quatre onglets (Avis, Questions, Programme, Admission) sont rendus côté serveur dans le HTML initial ; ceux qui ne sont pas affichés portent l’attribut `hidden`. Google lit le contenu des onglets masqués. `?onglet=programme` ouvre l’onglet Programme, avec la canonique vers la fiche : aucun doublon. Les 10 premiers avis, le programme, la section Admission et « Même mention, ailleurs » sont donc dans le HTML, dans l’ordre (sans écran de chargement intermédiaire).
- Images : le site n’a pas d’image de contenu (les illustrations sont en CSS/SVG décoratifs `aria-hidden`).

### 4. Données structurées

Voir `donnees-structurees.md` : `Organization` + `WebSite` partout, `BreadcrumbList` identique au fil visible, `EducationalOccupationalProgram` sur les fiches, `CollegeOrUniversity` sur les universités. **Pas d’`aggregateRating`** (type non éligible aux extraits d’avis), **pas de `FAQPage`** (plus affiché depuis mai 2026), **pas de `SearchAction`** (retiré en 2024). Validateur schema.org : 0 erreur, 0 avertissement sur chaque type de page.

### 5. Pages ville et ville × mention

- Construites comme les fiches mention et université : en-tête, une ligne de liens, puis les mêmes filtres et la même liste paginée (20 par page, « Mieux notés » d’abord). Filtres, tris et recherche : `noindex, follow`, canonique vers la page sans filtre ; chaque page de la liste a sa canonique.
- `/masters/{ville}` : `h1` « Les masters à Nantes », phrase calculée (« 157 parcours dans 3 établissements publics, 16 avis d’étudiant·es ») ; « Les plus proposées : » les 6 mentions les plus fournies (vers la page ville × mention, ou la fiche quand il n’y a qu’un parcours) et « Les n mentions à Nantes → » (index `/mentions?ville=`) ; « Établissements : » ; tous les parcours de la ville (parcours les mieux notés en tête).
- `/masters/{ville}/{mention}` seulement à partir de 2 parcours publiés (sinon 404) : `h1` « Masters de droit à Nantes », intro calculée ; « Aussi à : » les autres villes ouvertes qui proposent la mention, « Toutes les villes » (fiche mention), « Toutes les mentions à Nantes » ; tous les parcours avec note et avis.
- `/masters` : toutes les villes ouvertes, les plus fournies d’abord, chacune vers sa page (indexable, dans le sitemap).
- Liens : ligne des villes de l’accueil, colonne « Par ville » du pied de page (les 5 villes les plus fournies, puis toujours « Toutes les villes → » vers `/masters`, qui n’est jamais orpheline), fiches mention (« Par ville : Nantes (12) · … ») et université, fil d’Ariane des fiches (Accueil › Nantes › Mention › Parcours, la mention menant à la page ville × mention quand elle existe).
- Elles suivent l’ouverture des villes (cache de 10 min, tags `zones` et `catalog`).
- Captures : `captures/page-ville-nantes-1280.png`, `-390.png`, `captures/page-ville-mention-1280.png`, `-390.png`.

### 6. robots.txt, sitemaps, outils des moteurs

- `app/robots.ts` (lu à l’exécution) ; sitemap index `/sitemap.xml` et cinq sitemaps (`pages`, `villes`, `mentions`, `universites`, `parcours`) en route handlers : `app/sitemap.ts` de Next.js ne génère pas d’index. Seules les URL indexables et canoniques ; `lastmod` = dernière modification de la fiche ou dernier avis publié (pas de `lastmod` pour l’À propos plutôt qu’une date fausse).
- IndexNow : file `Job` « indexnow » remplie à la publication / au retrait d’un avis et à la publication d’une fiche, envoyée par le worker au plus une fois par minute, en production et avec `INDEXNOW_KEY` seulement.
- Search Console, Bing : `mise-en-ligne.md`.

### 7. Liens internes

`pnpm seo:check` parcourt le sitemap puis toutes les pages indexables atteintes par un lien (pagination comprise) : **0 page orpheline, 0 lien interne cassé** sur 5 402 pages lues. Les cartes de master ont le nom du parcours comme texte de lien ; aucun « cliquez ici ».

### 8. Open Graph

`og:title`, `og:description`, `og:url`, `og:type`, `og:locale` `fr_FR`, `twitter:card` `summary_large_image` sur chaque page. Images générées (`app/og/[kind]/[file]`) pour fiches, mentions, universités, villes et villes × mention : fond violet ou night, logo, titre en Bricolage, établissement et ville, note dans sa pastille inclinée et nombre d’avis. L’adresse porte une version calculée sur la note et le nombre d’avis (`?v=…`) : mise en cache un an, nouvelle image dès que la note change. Image par défaut : `/og/site.png`. Captures : `captures/og-fiche-parcours.png`, `captures/og-ville.png`.

### 9. Performance

- Polices : déjà auto-hébergées par `next/font` (latin, `swap`, polices de secours ajustées). La police mono (codes, admin) n’est plus préchargée.
- Animations d’entrée (fondu de page, cartes en cascade, ligne des villes) coupées au premier chargement d’un document (`html.nm-first`, retirée à la première navigation) : le contenu est peint tout de suite. LCP réel : 0,5–0,8 s → **0,2–0,3 s**.
- Palette ⌘K chargée à sa première ouverture (`next/dynamic`) ; le formulaire d’avis était déjà sur sa propre route.
- Fiche : plus d’écran de chargement, le HTML arrive dans l’ordre.
- Bandeau d’information : déjà rendu côté serveur (hauteur réservée). CLS 0,026 partout.
- **Génération statique incrémentale : non retenue** : la mise en page publique lit la session (en-tête, « Suivre », pied de page). Les données sont en cache (`unstable_cache`, tags `catalog`, `zones`, `program:{id}`, expirés à la publication d’un avis et à la synchro) et le cache Cloudflare des pages anonymes reste disponible (`CDN_CACHE_PUBLIC`). Passer en ISR demanderait de sortir la session de la mise en page : chantier à part.
- Lighthouse CI : `lighthouserc.cjs` (accueil, Explorer, fiche, page ville ; seuils Performance ≥ 90, SEO = 100, CLS < 0,1, TBT < 200 ms en substitut de l’INP ; LCP en deux niveaux : avertissement au-dessus de 2,5 s, échec au-dessus de 3,5 s, raison en commentaire dans `lighthouserc.cjs`), dans la CI et à la main sur la production.

### 10–11. Divers, contrôles automatiques

- `<html lang="fr">`, `viewport`, `theme-color`, icônes : déjà en place.
- `pnpm seo:check` : échoue sur titre / description manquant, en double ou hors longueurs (titre 25–70, description 70–170), canonique absente ou étrangère, page du sitemap en `noindex` ou non 200, JSON-LD invalide ou fil d’Ariane différent du visible, `h1` ≠ 1, lien interne cassé, page orpheline, Open Graph incomplet, `<title>` hors du `<head>`.
- CI : `.github/workflows/seo.yml` (base de démonstration, build de production démarré dans le job, `seo:check` puis Lighthouse CI).
- Axe : aucune violation sérieuse sur les pages ville (nouveau test e2e `45-pages-ville.spec.ts`).

## Après

| Type de page                 | `title` (exemple réel)                                                     | Description | `h1` | Canonique               | Indexation                   | JSON-LD                                                               | JS (Ko gz) | Lighthouse Perf / SEO / Access. |
| ---------------------------- | -------------------------------------------------------------------------- | ----------- | ---- | ----------------------- | ---------------------------- | --------------------------------------------------------------------- | ---------- | ------------------------------- |
| Accueil                      | « Avis sur les masters, programmes et admission \| notetonmaster »         | 143 car.    | 1    | `/`                     | indexée                      | Organization, WebSite                                                 | 229        | 90 / 100 / 100                  |
| Accueil avec recherche       | idem                                                                       | idem        | 1    | elle-même               | noindex, follow              | idem                                                                  | 229        | –                               |
| Explorer                     | « Explorer les masters dans 8 villes \| notetonmaster »                    | 143 car.    | 1    | `/explorer`             | indexée                      | Organization, WebSite                                                 | 237        | 94 / 100 / 100                  |
| Explorer filtré, page 2      | idem (« — page 2 »)                                                        | idem        | 1    | `/explorer` / `?page=2` | noindex, follow              | idem                                                                  | 237        | –                               |
| Fiche parcours (avec avis)   | « Master Valorisation des nouveaux patrimoines – Nantes \| notetonmaster » | 152 car.    | 1    | la fiche                | indexée                      | + BreadcrumbList, EducationalOccupationalProgram, CollegeOrUniversity | 242        | 88 / 100 / 100                  |
| Fiche sans avis ni programme | « Master Sciences analytiques – Univ. Strasbourg : avis \| notetonmaster » | 145 car.    | 1    | la fiche                | indexée                      | idem                                                                  | 242        | 91 / 100 / 100                  |
| Fiche `?onglet=programme`    | idem fiche                                                                 | idem        | 1    | **la fiche**            | indexée (canonique)          | idem                                                                  | 242        | –                               |
| Fiche inconnue               | « Page introuvable »                                                       | –           | 1    | –                       | **404**                      | –                                                                     | –          | –                               |
| Fiche mention                | « Master Droit : 10 parcours dans 4 villes \| notetonmaster »              | 127 car.    | 1    | la mention              | indexée ; filtres noindex    | + BreadcrumbList                                                      | 237        | 95 / 100 / 100                  |
| Fiche université             | « Masters à Nantes Université : 146 parcours et avis \| notetonmaster »    | 123 car.    | 1    | l’université            | indexée ; filtres noindex    | + BreadcrumbList, CollegeOrUniversity                                 | 237        | –                               |
| Page ville                   | « Masters à Nantes : 157 parcours, avis d’étudiant·es \| notetonmaster »   | 143 car.    | 1    | `/masters/nantes`       | indexée                      | + BreadcrumbList                                                      | 237        | 93 / 100 / 100                  |
| Page ville × mention         | « Masters de sciences du…et des produits santé à Nantes \| notetonmaster » | 128 car.    | 1    | elle-même               | indexée                      | + BreadcrumbList                                                      | 228        | –                               |
| À propos, pages légales      | « À propos : sources, modération et contact \| notetonmaster »             | 157–161     | 1    | elle-même               | indexées                     | Organization, WebSite                                                 | 228–229    | –                               |
| `/comparer`                  | « Comparer des parcours de master \| notetonmaster »                       | 118 car.    | 1    | `/comparer`             | noindex, follow              | idem                                                                  | 229        | –                               |
| Connexion, formulaire d’avis | « Se connecter \| notetonmaster »                                          | –           | 1    | –                       | noindex, nofollow + Disallow | –                                                                     | 230–239    | –                               |
| `robots.txt`, sitemaps       | 200, lus à l’exécution                                                     |             |      |                         |                              |                                                                       |            |                                 |

Lighthouse (médiane de 3, mobile) : Performance 83–87 → **88–95** ; SEO 83–100 → **100** ; accessibilité 100 ; CLS 0,026 ; LCP simulé 3,9–4,1 s → **2,7–3,4 s** (réel 0,2–0,3 s). Capture : `captures/lighthouse-fiche-parcours.png`.

`pnpm seo:check` sur le site entier : 6 sitemaps, 2 110 URL, 5 402 pages lues, 2 280 indexables, **0 erreur**.

## Chiffres demandés

Pages indexables (sitemaps, données de développement du 17/11/2026) :

| Type                  | Pages                                                               |
| --------------------- | ------------------------------------------------------------------- |
| Fiches parcours       | 1 548                                                               |
| Fiches mention        | 218                                                                 |
| Fiches université     | 18                                                                  |
| Pages ville           | 8                                                                   |
| Pages ville × mention | 309                                                                 |
| Pages fixes           | 9                                                                   |
| **Total sitemaps**    | **2 110** (+ 170 pages de listes `?page=n` atteintes par les liens) |

Fiches publiées sans programme ni avis, par ville (une fiche enseignée dans deux villes compte deux fois) :

| Ville       | Fiches | Sans programme ni avis | Sans aucune donnée d’admission |
| ----------- | ------ | ---------------------- | ------------------------------ |
| Montpellier | 416    | 415                    | 0                              |
| Lyon        | 413    | 412                    | 0                              |
| Marseille   | 270    | 270                    | 0                              |
| Strasbourg  | 240    | 240                    | 0                              |
| Nantes      | 157    | 155                    | 0                              |
| Mulhouse    | 34     | 34                     | 0                              |
| Belfort     | 12     | 12                     | 0                              |
| Montbéliar  | 7      | 7                      | 0                              |

Toutes les fiches ont au moins une donnée d’admission (« D’où viennent les admis », évolution) : aucune n’est une page vide. Mais 99 % n’ont ni programme ni avis : leur contenu propre se limite à l’admission calculée et aux comparaisons. Ce sont elles que Google risque de classer « explorée, non indexée » ; l’enrichissement qui pèserait le plus est le programme (collecte des sites d’université, bloquée pour Strasbourg et en partie Nantes : voir « Restes »).

## Restes et points à trancher

1. **LCP simulé entre 2,5 et 3,5 s** sur cette machine (2,7–3,4 s ; réel 0,2–0,3 s). Ce qui reste sur le chemin critique de la simulation : ≈ 210 Ko de JavaScript, dont ≈ 160 Ko de Next.js / React, incompressibles sans changer de cadre, et deux polices préchargées. Ne plus précharger Inter n’a rien donné de net (essai fait puis retiré). Lighthouse CI le signale en avertissement et n’échoue qu’au-dessus de 3,5 s ; à revoir avec les données réelles de Search Console.
2. **85 groupes de fiches identiques** (171 fiches : même titre, établissement, modalité, entrée, campus et ville ; seul le numéro Mon Master diffère), dans `data/fiches-identiques.csv`. Leurs titres restent uniques grâce au numéro Mon Master, mais ce sont des doublons à fusionner dans Récupération › Rapprochements.
   Strasbourg, Mulhouse et Nantes : 19 groupes, 46 fiches, aucune avec un avis — Nantes Université (Chimie-Biologie ×6, Biologie et médicaments ×4, Droit public ×3, Droit social et de la santé ×3, Physique fondamentale et applications ×3, Électronique, énergie électrique, automatique ×3, Droit de la concurrence et de la consommation, Droit européen et international, Justice, MIAGE, Mathématiques fondamentales ×2), Cnam Nantes (Marketing intégré dans un monde digitalisé ×2), Université de Haute-Alsace (Anglais ×2, Entrepreneuriat et management de projets ×2), Université de Strasbourg (Projets de coopération et intelligence collective ×3, Anthropologie sociale et culturelle, Communication et information stratégique, Enseigner les arts plastiques et le design, Pédagogie musicale et enseignement ×2).
3. **Ville « Montbéliar »** (slug `montbeliar`) : corrigée en « Montbéliard » (migration `city_index`, 301 de l’ancien slug dans `next.config.ts`).
4. **Test des résultats enrichis de Google** : à passer le jour de la mise en ligne (pas d’API, ne lit pas un build local).
5. **Programmes d’une université injoignable par le robot** : son serveur de catalogue coupe toutes les connexions du robot (HTTP/2 et HTTP/1.1, sans code HTTP), et la collecte a enregistré un `robots.txt` en 503. Selon la règle du client de collecte (RFC 9309), un `robots.txt` injoignable vaut interdiction totale : rien n’est collecté, rien n’est contourné, et le profil reste en pause. Ses programmes passent par la saisie manuelle dans l’admin.
6. **Fiches d’établissements privés** : laissées en `noindex` et hors sitemap, comme avant (décision existante).
