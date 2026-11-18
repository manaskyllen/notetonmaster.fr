# notetonmaster

**notetonmaster** aide à choisir un master en France. Le site compare les masters des universités et
écoles publiques parcours par parcours, avec leurs programmes, leurs chiffres d'admission et les avis
de celles et ceux qui les ont suivis.

Le dépôt contient tout le projet :

- le site public ;
- l'espace étudiant·e ;
- une messagerie anonyme entre futur·es et ancien·nes étudiant·es ;
- le panneau d'administration (modération, données, équipe) ;
- le worker qui collecte les données publiques.

Le code est sous licence [AGPL-3.0](LICENSE).

---

## Sommaire

- [Ce que fait le site](#ce-que-fait-le-site)
- [Démarrer en local](#démarrer-en-local)
- [Comptes de démonstration](#comptes-de-démonstration)
- [Commandes](#commandes)
- [Tests](#tests)
- [Architecture](#architecture)
- [Données publiques et collecte](#données-publiques-et-collecte)
- [Mise en production](#mise-en-production)
- [Vie privée et sécurité](#vie-privée-et-sécurité)
- [Contribuer](#contribuer)
- [Licence](#licence)

---

## Ce que fait le site

**Pour les candidat·es**

- **Recherche** : un champ unique sur l'accueil (⌘K / Ctrl K partout ailleurs). Il trouve un master,
  une mention, un établissement ou une ville, ou un code RNCP, Mon Master ou UAI. Les accents et la
  casse sont ignorés.
- **Explorer** : tous les parcours, avec des filtres à facettes et leurs compteurs (avis, domaine,
  mention, lieu, établissement, modalité, entrée en M1 ou M2, accessibilité, places), des tris et
  une pagination. Tout est gardé dans l'adresse.
- **Index** `/mentions` et `/universites` : toutes les mentions et tous les établissements
  publiés, avec des filtres par domaine, ville et type, et la note moyenne.
- **Fiche parcours** : les avis d'abord, puis le programme année par année, l'admission
  (« D'où viennent les admis ? », évolution sur plusieurs sessions, attendus) et la fiche
  d'identité avec ses sources.
- **Comparer** jusqu'à trois parcours, et **suivre** des masters pour recevoir leurs nouveaux avis.
- **Questions publiques** aux ancien·nes du parcours, et **messagerie anonyme** avec l'auteur·rice
  d'un avis, quand cette personne l'accepte.

**Pour les étudiant·es et diplômé·es**

- **Donner son avis** en trois étapes, sans créer de compte (lien de connexion par mail).
- **Mon espace** : ses avis, ses conversations, ses masters suivis, la vérification de son
  inscription (adresse universitaire ou justificatif) et l'export ou la suppression de ses données.

**Pour les établissements**

- **Droit de réponse** de l'équipe pédagogique sous un avis, après vérification de l'adresse
  professionnelle.

**Pour l'équipe du site** (`/admin`)

- **Connexion** par mot de passe puis code TOTP, avec des rôles (Admin, Modération, Données, Légal).
- **Modération** des avis, des signalements et des demandes légales, avec un journal d'audit.
- **Données** : synchronisation des sources publiques, propositions à valider, édition des fiches.
- **Paramètres** : villes ouvertes, bandeau d'information, règles de modération, durées de
  conservation.

**Lancement ville par ville.** Seuls les parcours des **villes ouvertes** (administrateur ›
Paramètres › Villes ouvertes) sont publiés. Une ville sans master publié n'apparaît jamais sur le
site.

---

## Démarrer en local

**Prérequis** : Docker avec Docker Compose v2. `make` est pratique mais facultatif. Node, pnpm et
Postgres ne sont pas nécessaires sur la machine : tout tourne dans des conteneurs.

```sh
git clone https://github.com/manaskyllen/notetonmaster.fr.git notetonmaster && cd notetonmaster
make dev        # crée .env depuis .env.example, construit l'image et lance la stack
# puis ouvrir http://localhost:3000
```

Sans `make` :

```sh
cp .env.example .env && docker compose up --build
```

Au premier lancement, le service `migrate` installe les dépendances, génère le client Prisma,
applique les migrations et charge le jeu de démonstration (`SEED_ON_START=true`). Les lancements
suivants gardent les données : le seed ne se rejoue que sur une base vide. `make seed` le force.

| Service                                 | URL                                 |
| --------------------------------------- | ----------------------------------- |
| Site public                             | http://localhost:3000               |
| Administration                          | http://localhost:3000/admin         |
| Mailpit (tous les mails envoyés en dev) | http://localhost:8025               |
| Vitrine des composants (dev uniquement) | http://localhost:3000/design-system |
| Health check                            | http://localhost:3000/api/health    |
| Postgres                                | `localhost:5432`, lié à 127.0.0.1   |

> Après un changement du schéma Prisma, redémarre l'app et le worker (`make restart`) : le serveur
> de développement garde l'ancien client Prisma en mémoire.

---

## Comptes de démonstration

> ⚠️ **Développement uniquement.** Ces identifiants sont publics : ils sont dans ce dépôt. Le seed
> de démo refuse de tourner en production si `APP_URL` n'est pas une adresse locale. En production,
> le service `migrate` lance `prisma/bootstrap.ts`, qui crée un seul compte admin avec un mot de
> passe généré.

Comptes fictifs, pour le développement local uniquement : ils sont refusés en production.

**Administration** : mot de passe `notetonmaster-demo`, puis code TOTP.

| Compte                            | Rôle       | Secret TOTP                                                                              |
| --------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `alexis@notetonmaster.example`    | Admin      | `KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD`                                                       |
| `camille@notetonmaster.example`   | Modération | `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`                                                       |
| `yanis@notetonmaster.example`     | Données    | pas encore configuré : à faire à la première connexion                                   |
| `juridique@notetonmaster.example` | Légal      | invitation en attente : http://localhost:3000/admin/invitation/demo-invitation-juridique |

Le code TOTP courant s'obtient avec `make totp email=alexis@notetonmaster.example`. On peut aussi
ajouter le secret dans une application d'authentification.

**Étudiant·es** : connexion par lien magique (le mail arrive dans Mailpit).

- `alexis.demo@demo.notetonmaster.local` : espace complet, avec des avis, des questions, des
  masters suivis et une vérification.
- Autres comptes : `bastien@`, `chloe@`, `diane@`, `elias@` et `farah@`, tous en
  `@demo.notetonmaster.local`.

**Anti-robot** : en dev et dans les tests, Cloudflare Turnstile tourne en mode `mock`
(`TURNSTILE_MODE=mock`). Aucune requête ne part vers Cloudflare et tous les formulaires passent.
Pour simuler un refus, mettre `fail` dans `localStorage["nm-turnstile-mock"]`.

**Ce qui est réel, ce qui est fictif**

- Fictifs (marqués `isDemo`) : les avis, comptes, conversations, signalements et demandes légales
  de démo. Les cas de modération (avis masqué, refusé, à reformuler) portent un texte
  explicitement fictif.
- Réels : le catalogue de démo (une mention, trois universités, neuf parcours) et ses chiffres,
  tirés des données ouvertes.

---

## Commandes

| Commande                                  | Effet                                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `make dev` / `make down`                  | Lance / arrête la stack de dev (app, worker, db, mailpit) avec rechargement à chaud                |
| `make logs`                               | Suit les journaux                                                                                  |
| `make seed`                               | Rejoue le seed (vide les tables puis recharge le même jeu)                                         |
| `make reset`                              | Vide la base, rejoue les migrations et le seed                                                     |
| `make migration name=xxx`                 | Crée une migration depuis le schéma Prisma, puis redémarre app et worker                           |
| `make restart`                            | Redémarre app et worker sur un cache Next.js propre                                                |
| `make totp email=…`                       | Code TOTP courant d'un compte admin de démo                                                        |
| `make test` / `make test-int`             | Tests unitaires / d'intégration (Vitest, voir [Tests](#tests))                                     |
| `make check`                              | typecheck + lint + tests unitaires                                                                 |
| `make e2e`                                | Tests de bout en bout (Playwright + axe) sur la stack de dev                                       |
| `make e2e-full`                           | Suite de bout en bout complète comme en CI : build de production, 4 serveurs et 4 bases            |
| `make tokens`                             | Régénère `styles/tokens.css` depuis `styles/tokens.json`                                           |
| `make shell`                              | Shell dans le conteneur de l'app                                                                   |
| `make prod-build`                         | Construit les images de production (`.env.prod`, projet `notetonmaster-prod`)                      |
| `make prod-up` / `make prod-down`         | Lance / arrête la stack de production en local (aucun port publié : réseau `gateway`)              |
| `make prod-logs`                          | Journaux de la stack de production locale                                                          |
| `make prod-local`                         | Build de production du code courant sur la base de dev, sur :3002                                  |
| `make perf` / `make vitals` / `make lhci` | Mesures de performance sur `make prod-local` (voir [docs/performance.md](docs/performance.md))     |
| `make seo-check`                          | Contrôle SEO de `make prod-local` depuis son sitemap (voir [docs/seo/audit.md](docs/seo/audit.md)) |
| `make data-national-preview`              | Vrais connecteurs, en aperçu seulement (rien n'est publié)                                         |
| `make data-replay-pilot mode=apply`       | Rejoue les extraits Mon Master de `fixtures/live`, sans réseau (`mode=preview` par défaut)         |
| `make help`                               | Liste toutes les cibles                                                                            |

Les scripts pnpm (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`…) se lancent dans
les conteneurs, par exemple `docker compose run --rm app pnpm lint`.

---

## Tests

| Commande                          | Ce qu'elle lance                                                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test` (`make test`)         | **Unitaires** (`tests/unit`, Vitest, sans base) : règles métier, validations, masquage des coordonnées, en-têtes, SEO                                                                                                                   |
| `pnpm test:int` (`make test-int`) | **Intégration** (`tests/integration`, vraie base PostgreSQL avec migrations et seed) : matrice des droits, accès directs par identifiant, sessions, codes, limites de débit, actions de l'administration                                |
| `pnpm test:coverage`              | Les deux, avec la couverture et ses seuils par dossier (90 % des lignes sur l'authentification, les permissions, l'anonymat et la messagerie)                                                                                           |
| `make e2e-full` / `make e2e`      | **De bout en bout** (`tests/e2e`, Playwright, Chromium ; voir [CONTRIBUTING.md](CONTRIBUTING.md#tests-de-bout-en-bout)) : avis sans compte, messagerie, suivi, recherche, Explorer, administration… dont l'anonymat des pages publiques |
| `pnpm test:a11y`                  | Accessibilité (axe-core) des pages publiques et de l'administration                                                                                                                                                                     |
| `pnpm check` (`make check`)       | lint, typage et tests unitaires                                                                                                                                                                                                         |
| `pnpm security:scan`              | gitleaks sur tout l'historique, `pnpm audit`, Semgrep (dans Docker)                                                                                                                                                                     |

Les tests d'intégration (`notetonmaster_test`) et de bout en bout (`make e2e-full`,
`notetonmaster_test_0` à `_3`) travaillent sur leurs propres bases, recréées à chaque lancement
(seed de démo et fixtures déterministes) : ta base de développement n'y change rien. Seul
`make e2e`, sur la stack de dev, utilise ta base.

**Intégration continue** (`.github/workflows/ci.yml`) : à chaque pull request et à chaque push sur
`main`, en parallèle, `lint-type`, `unit`, `integration`, `migrations`, `build` (un seul build de
production, réutilisé), `e2e`, `security` (gitleaks, `pnpm audit`, Semgrep, revue des
nouvelles dépendances une fois le dépôt public), `build-budget` et `seo`. La suite de bout en bout tourne en entier : sur
une pull request seulement si le site, ses dépendances ou ses tests changent, toujours sur `main`.
Aucune modification n'arrive sur `main` sans eux. Chaque nuit, `nightly.yml` lance un scan
OWASP ZAP sur un build local, l'audit des dépendances, gitleaks sur tout l'historique, Lighthouse sur toutes
les pages et la suite de bout en bout complète.

**Contrôles d'une adresse** (lecture seule, ✅ / ❌) : `pnpm smoke`, `pnpm seo:check`,
`pnpm lighthouse` et `pnpm links`, avec `--url=http://localhost:3002` sur `make prod-local` ou
`--url=https://notetonmaster.fr` après un déploiement ([docs/deploiement.md](docs/deploiement.md)).

---

## Architecture

**Pile technique** : Next.js 16 (App Router, React 19, composants serveur), TypeScript, Tailwind 4,
Prisma 7 sur PostgreSQL 17, React Email, Vitest et Playwright. Tout tourne sous Docker, avec
Node 24 et pnpm.

```
app/(public)          site public : accueil, explorer, index, fiches, avis, espace, légal…
app/admin             connexion admin et pages de l'administration
app/api               health, recherche, progression des synchronisations, lectures d'avis
app/design-system     vitrine des composants et des animations (404 en production)
components/ui         composants de base du design system
components/…          catalog, public, espace, admin, site, launch
content/legal         pages légales en Markdown (champs « À compléter » à remplir avant la mise en ligne)
emails/               gabarits de mail (React Email, HTML + texte)
lib/domain            règles métier pures, testées
lib/catalog           recherche, facettes, index, notes dénormalisées
lib/connectors        une source de données = un connecteur (mode simulé ou réel)
lib/data              client HTTP poli (robots.txt, délais), nettoyage des données personnelles
lib/auth              sessions, liens magiques, TOTP, mots de passe, rôles
lib/launch            villes ouvertes
prisma/               schéma, migrations, seed de démo, bootstrap de production, fixtures
worker/               jobs en base, synchronisations planifiées, maintenance
styles/               jetons (tokens.json → tokens.css), formulaires, fenêtres, mouvement
scripts/              jetons, icône, TOTP, mesures de performance, rejeux de données
fixtures/             extraits des sources publiques et pages de test (voir plus bas)
tests/unit, tests/e2e
docs/                 animations, performance, une fiche par source de données
```

**Le worker** traite :

- les jobs en base (par exemple l'export des données d'un·e étudiant·e) ;
- les synchronisations des sources, selon le cron de chaque source ou à la demande depuis
  l'administration ;
- la maintenance quotidienne : messages anciens, liens expirés, données de connexion, comptes
  inactifs, selon les durées fixées dans les paramètres ;
- les récapitulatifs hebdomadaires (nouveaux avis des masters suivis, questions sans réponse) ;
- le rafraîchissement de l'index de recherche après chaque synchronisation réussie.

**Cache** : les listes et les compteurs sont mis en cache (`unstable_cache`) avec des tags,
invalidés à chaque avis publié, à chaque synchronisation et à chaque ouverture de ville. Le worker
demande l'invalidation au site par un appel signé (`/api/internal/revalidate`).

**Choix techniques** : les choix d'architecture sont expliqués dans le code et dans
[docs/](docs/).

---

## Données publiques et collecte

Les chiffres du site viennent de données publiques. Chaque donnée affichée indique sa source et
son année. Chaque source a une fiche dans [docs/sources/](docs/sources/), avec son schéma dans
`fixtures/schemas/`.

| Source                                                         | Producteur                                                      | Licence                        |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ |
| Mon Master, données ouvertes (sessions 2023 à 2025)            | Ministère de l'Enseignement supérieur et de la Recherche (MESR) | Licence Ouverte 2.0            |
| Principaux établissements et implantations                     | MESR                                                            | Licence Ouverte 2.0 / 1.0      |
| InserSup, insertion professionnelle des diplômé·es de master   | MESR                                                            | Licence Ouverte 2.0            |
| Diplômes préparés (SISE)                                       | MESR                                                            | Licence Ouverte 2.0            |
| Masters à entrée sélective en M2                               | MESR                                                            | Licence Ouverte 2.0            |
| Répertoire national des certifications professionnelles (RNCP) | France compétences                                              | Licence Ouverte 2.0            |
| Communes (geo.api.gouv.fr)                                     | État                                                            | Licence Ouverte 2.0            |
| Idéo-Formations initiales (désactivé par défaut)               | Onisep                                                          | ODbL                           |
| Sites des universités (programmes, attendus)                   | chaque établissement                                            | lecture polie, voir ci-dessous |

**Extraits dans le dépôt.** `fixtures/live/` contient de très petits extraits des jeux ouverts
(quelques lignes chacun), pour que les tests tournent sans réseau.

- Les numéros de téléphone ont été retirés de l'extrait Onisep. Cet extrait reste sous ODbL :
  attribution Onisep.
- Les pages d'universités de `fixtures/live/univ-sites/` sont **fictives**. Elles ont le balisage
  des CMS universitaires (Ametys, K-Sup, Drupal) et des intitulés de cours, mais un texte inventé :
  aucun contenu d'une vraie université n'est versionné.

**Collecte polie.** Le robot du site (User-Agent `notetonmasterBot/1.0`, avec l'adresse de sa
page, `CRAWLER_INFO_URL`, en production `https://notetonmaster.fr/a-propos#notre-robot`, et son
adresse de contact) est présenté sur [`/a-propos#notre-robot`](<app/(public)/a-propos/page.tsx>) :
ce qu'il lit, à quel rythme, et comment exclure un site. Il :

- respecte `robots.txt` et ne lit que les domaines déclarés pour chaque établissement ;
- espace ses requêtes vers un même hôte ;
- n'utilise jamais d'API non documentée.

Les noms, adresses mail et numéros de téléphone trouvés dans les pages sont retirés avant tout
enregistrement (`lib/data/pii.ts`).

**Mode simulé.** Par défaut (`CONNECTORS_MODE=mock`), les connecteurs ne touchent pas au réseau :
le dev, les tests et la CI tournent hors ligne.

---

## Mise en production

La procédure complète est dans [docs/deploiement.md](docs/deploiement.md) : serveur, passerelle
Caddy, variables (`.env.prod.example`), `scripts/deploy.sh`, sauvegardes chiffrées et restauration,
mails, ouverture des villes. Elle est manuelle, et aucun workflow ne déploie.

En production, le serveur refuse de démarrer s'il manque une variable, si une valeur de
développement ou une clé de test est encore là, ou si la base contient des données de démo
(`lib/env.ts`, `lib/auth/demo.ts`). Une base neuve démarre avec toutes les villes fermées et
`PUBLIC_INDEXING=false` : rien n'est indexé tant que les villes ne sont pas ouvertes.

Pour essayer la pile de production sur ta machine : `cp .env.prod.example .env.prod`, puis dans
`.env.prod` des secrets locaux, `APP_URL=http://localhost:3001`, `ALLOW_INSECURE_LOCAL_PROD=1`
(refusé sur une adresse publique), `TURNSTILE_MODE=mock`, et `make prod-build prod-up`. Elle
tourne sous le projet `notetonmaster-prod`, à côté de la pile de dev.

---

## Vie privée et sécurité

- **Avis anonymes** : aucun nom n'est publié. L'adresse mail d'un·e auteur·rice ne sert qu'à la
  connexion et à la messagerie.
- **Chiffrement** : les adresses mail des étudiant·es, des contacts et des demandeur·ses, ainsi que
  les secrets TOTP, sont chiffrés au repos (AES-256-GCM). Les recherches passent par des HMAC.
- **Justificatifs** : ils sont stockés dans un volume privé, jamais servis publiquement, et
  supprimés dès la décision de la modération.
- **Protection des formulaires** : limites de débit en base sur chaque formulaire et Turnstile sur
  les formulaires publics.
- **Administration** : connexion par mot de passe argon2id puis TOTP, avec verrouillage après
  plusieurs échecs.
- **Durées de conservation** réglables dans l'administration et appliquées chaque jour par le
  worker.

Pour signaler une faille, voir [SECURITY.md](SECURITY.md). Merci de ne pas ouvrir de ticket public
pour une vulnérabilité.

---

## Contribuer

Les contributions sont les bienvenues : voir [CONTRIBUTING.md](CONTRIBUTING.md). En bref :

- `make check` doit passer ;
- une fonctionnalité visible vient avec son test e2e ;
- les textes du site s'écrivent en français, en écriture inclusive avec le point médian.

---

## Licence

Le code est publié sous **GNU Affero General Public License v3.0 ou ultérieure**
([LICENSE](LICENSE)). Si tu fais tourner une version modifiée de ce site accessible en ligne, tu
dois en publier le code source modifié sous la même licence.

Les données publiques réutilisées restent sous leur propre licence (voir
[Données publiques](#données-publiques-et-collecte)). Les polices Inter, Bricolage Grotesque et JetBrains
Mono sont sous SIL Open Font License, et auto-hébergées au build par `next/font`.
