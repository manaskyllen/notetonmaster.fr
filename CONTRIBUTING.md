# Contribuer à notetonmaster

Merci de ton intérêt. Le [README](README.md) explique comment lancer le projet en local. Tout
tourne sous Docker : il te faut seulement Docker et, si possible, `make`.

## Avant de proposer un changement

- **Une idée de fonctionnalité** : ouvre d'abord un ticket pour en discuter. Le site reste
  volontairement simple, et certaines idées ont déjà été essayées puis retirées. Les choix
  d'architecture sont expliqués dans le code et dans [docs/](docs/).
- **Un bug** : un ticket avec l'adresse de la page, ce que tu attendais et ce que tu as vu suffit.
- **Une faille de sécurité** : jamais en ticket public, voir [SECURITY.md](SECURITY.md).

## Le changement lui-même

1. Crée une branche depuis `main`.
2. Lance `make check` (typecheck, lint, tests unitaires) et `make test-int` (tests sur la base) :
   ils doivent passer.
3. Si ton changement touche le site, ajoute ou adapte un test dans `tests/e2e` (voir
   [Tests de bout en bout](#tests-de-bout-en-bout)). Une action serveur ou une route nouvelle entre
   dans la matrice des droits ([docs/matrice-des-droits.md](docs/matrice-des-droits.md)) et dans
   son test.
4. Si tu modifies le schéma Prisma, crée la migration avec `make migration name=…` et versionne-la.
   Ne modifie jamais une migration déjà publiée.
5. Décris dans la demande de fusion ce qui change pour la personne qui utilise le site, et comment
   tu l'as vérifié.

## Tests de bout en bout

La suite Playwright (`tests/e2e`, Chromium) tourne sur un build de production, comme en CI :
`scripts/e2e-stack.sh` sert le même build quatre fois, chaque serveur avec sa base
(`notetonmaster_test_0` à `_3`, copiées d'une base modèle remplie par le seed de démo et les fixtures
déterministes de `tests/integration/fixtures` et `tests/e2e/fixtures`), son worker et son expéditeur
de mails. Le processus Playwright n°i ne parle qu'au
serveur n°i : les tests d'un fichier ne voient jamais les écritures d'un autre. Les comptes de démo
se connectent une fois par serveur, par les écrans, dans le projet `setup`
(`tests/e2e/auth.setup.ts`) ; les tests repartent de ces sessions.

- **Suite complète** : `make e2e-full` (build, bases, serveurs, tests, arrêt). `servers=2` pour
  moins de processus.
- **Un seul fichier** : `make e2e-full args="tests/e2e/03-review-without-account.spec.ts"`, ou un
  test : `args="tests/e2e/24-suivre.spec.ts -g 'Explorer'"`.
- **Pendant le développement** : `make dev` puis `make e2e` lance la suite sur la stack de dev
  (un seul processus, base de développement) : plus lent, et sensible à l'état de ta base.
- Pas de `waitForTimeout` : on attend un élément, une réponse ou la fin des animations
  (`animationsDone` de `tests/e2e/helpers.ts`).
- Un test ne dépend jamais des données de ta base de développement : ce dont il a besoin est dans
  les fixtures, ou créé par le test lui-même.
- En CI, la suite complète tourne à chaque pull request qui touche le site, ses dépendances ou ses
  tests, à chaque push sur `main` et chaque nuit ; `pnpm deploy:check` refuse un commit dont la
  suite n'est pas verte sur `main`.

## Avant chaque commit

Après `make install`, un crochet de pré-commit (Husky et lint-staged) tourne à chaque
`git commit`, dans les conteneurs Docker, en moins de 10 secondes :

- ESLint et Prettier sur les fichiers modifiés, corrigés automatiquement quand c'est possible ;
- le typage (`tsc --noEmit`, incrémental) ;
- gitleaks sur ce qui est indexé : un commit qui contient un secret est refusé.

En cas d'urgence, `git commit --no-verify` passe outre. La CI vérifie de toute façon la même
chose, et davantage.

## La CI

Chaque pull request passe par `.github/workflows/ci.yml` : lint et typage, tests unitaires, tests
d'intégration sur une vraie base, cohérence des migrations, bout en bout et accessibilité,
sécurité (gitleaks, audit des dépendances, Semgrep, CodeQL, revue des nouvelles dépendances),
budget JavaScript et SEO. Tous ces jobs sont obligatoires pour fusionner.

- Une contribution venant d'un fork n'a accès à aucun secret : la CI n'en utilise aucun, seulement
  des valeurs de test et la base du job.
- Une migration qui supprime une table ou une colonne doit porter le libellé « migration
  validée », posé après relecture.

## Conventions

- **Code** : TypeScript strict, composants serveur par défaut. Le mouvement passe par
  `styles/motion.css`, et les couleurs et tailles par les jetons (`styles/tokens.json`, puis
  `make tokens`). Commentaires de code en anglais.
- **Textes du site** : en français, simples et directs.
  - Écriture inclusive avec le point médian (« étudiant·es »).
  - Apostrophe typographique (’) et guillemets « … ».
  - Le nom s'écrit toujours `notetonmaster`, avec le composant `BrandName` dans les pages.
- **Accessibilité** : chaque page doit passer axe sans violation sérieuse et fonctionner au clavier.
  Tout mouvement doit se couper avec `prefers-reduced-motion`.
- **Données** :
  - Ne versionne aucune donnée personnelle : ni nom, ni adresse mail, ni téléphone, ni avis réel.
  - Les extraits de `fixtures/` viennent de jeux sous licence ouverte, ou sont fictifs.
  - Une nouvelle source de données ajoute une fiche dans `docs/sources/` : licence, `robots.txt`,
    fréquence.

## Licence

En contribuant, tu acceptes que ta contribution soit publiée sous la licence du projet,
[AGPL-3.0-or-later](LICENSE).
