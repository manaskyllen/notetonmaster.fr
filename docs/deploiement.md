# Déploiement manuel sur notetonmaster.fr

Le déploiement est **manuel** : aucun workflow ne déploie. Il n'y a pas de préproduction, la
production est `https://notetonmaster.fr`. Tout ce qui se vérifie avant se fait sur un build de
production local (`make prod-local`, puis `http://localhost:3002`) ou dans la CI.

Architecture sur le serveur :

- **Caddy** est le seul service exposé (ports 80 et 443). Il termine le HTTPS et relaie vers le
  conteneur `app` sur le réseau Docker interne. Il est configuré **sans `trusted_proxies`** : il
  remplace `X-Forwarded-For` par l'IP réelle du client. L'application lit donc le dernier élément
  de cet en-tête (`TRUSTED_PROXY_HOPS=1`, `lib/ip.ts`).
- La pile `docker-compose.prod.yml` : `db` (PostgreSQL, jamais exposé), `migrate` (une fois par
  déploiement), `app` (site), `worker` (tâches et collecte).

> **Un CDN devant Caddy, un jour ?** Configurer alors `trusted_proxies` dans Caddy avec les plages
> du CDN, et revoir la lecture de l'IP : `PROD_TRUST_CLOUDFLARE=true` pour Cloudflare, ou
> `PROD_TRUSTED_PROXY_HOPS`. Sinon les limites de débit et le journal de connexion se fondent sur
> l'adresse du CDN.

## En-têtes : qui envoie quoi

- **HSTS** est envoyé **par l'application** (`next.config.ts`), seulement quand `APP_URL` est en
  HTTPS : `max-age=31536000; includeSubDomains`, sans `preload` pour l'instant. **Caddy ne doit pas
  en ajouter un second** : pas de directive `header Strict-Transport-Security` dans le Caddyfile.
  `pnpm smoke` vérifie qu'il n'est envoyé qu'une fois.
- La CSP (avec nonce), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, COOP et CORP viennent aussi de l'application. Caddy n'en ajoute aucun.
- Caddy retire seulement l'en-tête `Server` (`header -Server`).

Caddyfile de référence :

```caddyfile
notetonmaster.fr {
	encode zstd gzip
	header -Server
	reverse_proxy app:3000
}

www.notetonmaster.fr, notetonmaster.com, www.notetonmaster.com {
	redir https://notetonmaster.fr{uri} permanent
}
```

## Variables de production (`.env` du serveur)

À générer à neuf, jamais copiées d'une autre machine, jamais commitées :

| Variable                                               | Comment la produire                                                                                        |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`                                    | `openssl rand -base64 32` (compte propriétaire, migrations seulement)                                      |
| `APP_DB_PASSWORD`                                      | `openssl rand -base64 32` (rôle `nm_app` du site et du worker)                                             |
| `SESSION_SECRET`                                       | `openssl rand -base64 48`                                                                                  |
| `APP_ENCRYPTION_KEY`                                   | `openssl rand -base64 32` (**à sauvegarder à part** : sans elle, adresses et secrets TOTP sont illisibles) |
| `PROD_APP_URL`                                         | `https://notetonmaster.fr`                                                                                 |
| `PROD_SMTP_*`, `MAIL_FROM`                             | compte du fournisseur de mail                                                                              |
| `PROD_TURNSTILE_SITE_KEY`, `PROD_TURNSTILE_SECRET_KEY` | tableau de bord Cloudflare › Turnstile, hôte `notetonmaster.fr`                                            |
| `INDEXNOW_KEY`                                         | `openssl rand -hex 16`                                                                                     |
| `PROD_CRAWLER_INFO_URL`, `PROD_CRAWLER_CONTACT_EMAIL`  | `https://notetonmaster.fr/a-propos#notre-robot`, adresse de contact du robot                               |

Interdits en production (le serveur refuse de démarrer, `lib/env.ts`) : `DEMO_DATA`,
`SEED_ON_START=true`, `CONNECTORS_MODE=mock`, `TURNSTILE_MODE=mock`, les clés de test Turnstile,
les secrets de `.env.example`, un `APP_URL` en `http://`, `PROD_ALLOW_INSECURE_LOCAL`. Au
démarrage, le site refuse aussi une base qui contient des données de démo (`lib/auth/demo.ts`).

`CRAWLER_ALLOW_HTTP=true` autorise le collecteur à lire des pages en `http://` (désactivé par
défaut : `https://` seulement). Il ne s'applique qu'aux adresses publiques : les adresses internes
restent refusées.

## 1. Avant

Sur la machine qui déploie :

```sh
git switch main && git pull
git tag v1.2.0 && git push origin v1.2.0
sh scripts/deploy-check.sh        # ou pnpm deploy:check
```

`deploy-check` vérifie que :

- l'arbre git est propre ;
- le commit porte un tag de version ;
- la CI est verte sur GitHub pour ce commit, sur son passage de `main`, où la suite de bout en bout
  tourne toujours en entier : une suite e2e qui n'est pas verte bloque le déploiement ;
- il liste les migrations ajoutées depuis le tag précédent, et signale en **DESTRUCTIVE** celles
  qui suppriment une table ou une colonne.

Une migration destructive passe par une pull request portant le libellé « migration validée » (job
`migrations` de la CI) et impose de vérifier la sauvegarde de l'étape 2 avant d'aller plus loin.

## 2. Sauvegarde de la base

Sur le serveur, dans le dossier du dépôt :

```sh
stamp=$(date -u +%Y-%m-%dT%H%MZ)
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "${POSTGRES_DB:-notetonmaster}" -Fc \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file /root/.nm-backup-pass \
  > "/var/backups/notetonmaster/nm-$stamp.dump.gpg"
```

- La sauvegarde est **chiffrée** (phrase de passe dans `/root/.nm-backup-pass`, lisible par root
  seulement, et gardée aussi hors du serveur).
- Elle est rangée dans `/var/backups/notetonmaster/` puis copiée hors du serveur (stockage d'un
  autre fournisseur).
- Conservation : 30 jours de sauvegardes quotidiennes, 12 mensuelles. Le reste est effacé.
- `backups/` du dépôt (exports JSON des tables supprimées par une migration) suit la même règle et
  n'est jamais commité.

**Restauration testée** : au moins une fois avant la mise en ligne, puis chaque trimestre, sur une
base jetable :

```sh
gpg --batch --decrypt --passphrase-file /root/.nm-backup-pass nm-<date>.dump.gpg > /tmp/nm.dump
docker run --rm -d --name nm-restore -e POSTGRES_PASSWORD=x postgres:17-alpine
docker cp /tmp/nm.dump nm-restore:/tmp/nm.dump
docker exec nm-restore sh -c 'sleep 5; createdb -U postgres nm && pg_restore -U postgres -d nm --no-owner /tmp/nm.dump'
docker exec nm-restore psql -U postgres -d nm -c 'SELECT count(*) FROM "Review";'
docker rm -f nm-restore && rm /tmp/nm.dump
```

Noter la date et le résultat (nombre d'avis restaurés) dans le CHANGELOG.

## 3. Migrations

Elles sont appliquées par le service `migrate`, avec le **compte propriétaire**
(`POSTGRES_USER`). Il enchaîne :

1. l'export des tables qu'une migration va supprimer ;
2. `prisma migrate deploy` ;
3. `pnpm db:roles`, qui met à jour le rôle `nm_app` (droits sur les nouvelles tables) ;
4. le bootstrap de production (réglages, premier compte admin).

Le site et le worker se connectent avec `nm_app`. Ce rôle lit et écrit des lignes, sans aucun DDL,
et n'accède au journal d'audit qu'en insertion (`lib/db/roles.ts`).

```sh
docker compose -f docker-compose.prod.yml run --rm migrate
```

## 4. Déploiement

```sh
git fetch --tags && git checkout v1.2.0
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d app worker
docker compose -f docker-compose.prod.yml ps
```

Si le site ne démarre pas, les journaux disent pourquoi (variable refusée, données de démo…) :

```sh
docker compose -f docker-compose.prod.yml logs --tail 100 app
```

## 5. Vérifications

Depuis n'importe quelle machine avec Docker, à la racine du dépôt :

```sh
docker compose run --rm --no-deps app pnpm smoke --url=https://notetonmaster.fr
docker compose run --rm --no-deps app pnpm seo:check --url=https://notetonmaster.fr
docker compose run --rm --no-deps app pnpm links --url=https://notetonmaster.fr
docker compose --profile e2e run --rm -T -e LHCI_BASE_URL=https://notetonmaster.fr e2e \
  sh -c 'CHROME_PATH=$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -1) node scripts/lighthouse.mjs --url=https://notetonmaster.fr'
```

Ces scripts ne font que des lectures : ils ne créent jamais rien en production. Chacun affiche ✅
ou ❌ et renvoie un code d'erreur en cas d'échec. Les mêmes commandes, avec
`--url=http://localhost:3002`, servent **avant** le déploiement sur `make prod-local`.

## 6. Retour en arrière

- **Le code seul pose problème** (aucune migration dans la version) : redéployer le tag précédent.

  ```sh
  git checkout v1.1.0
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml up -d app worker
  ```

- **Une migration a cassé quelque chose** : arrêter le site, restaurer la sauvegarde de l'étape 2,
  puis redéployer le tag précédent. Les avis et messages écrits entre la sauvegarde et la
  restauration sont perdus : à décider selon l'heure, et à annoncer dans le bandeau.

  ```sh
  docker compose -f docker-compose.prod.yml stop app worker
  gpg --batch --decrypt --passphrase-file /root/.nm-backup-pass /var/backups/notetonmaster/nm-<date>.dump.gpg \
    | docker compose -f docker-compose.prod.yml exec -T db pg_restore -U "$POSTGRES_USER" -d "${POSTGRES_DB:-notetonmaster}" --clean --if-exists --no-owner
  git checkout v1.1.0
  docker compose -f docker-compose.prod.yml build
  docker compose -f docker-compose.prod.yml run --rm migrate   # remet les droits de nm_app
  docker compose -f docker-compose.prod.yml up -d app worker
  ```

## 7. Après

Ajouter une entrée dans `CHANGELOG.md` : version, date, ce qui change pour les personnes qui
utilisent le site, migrations appliquées, restauration testée le cas échéant.

## Mails : SPF, DKIM et DMARC

Enregistrements DNS attendus pour le domaine d'envoi `notetonmaster.fr` (valeurs exactes données
par le fournisseur de mail) :

| Type         | Nom                                       | Valeur                                                                       |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------------- |
| TXT          | `notetonmaster.fr`                        | `v=spf1 include:<domaine SPF du fournisseur> -all`                           |
| TXT ou CNAME | `<sélecteur>._domainkey.notetonmaster.fr` | clé publique DKIM du fournisseur                                             |
| TXT          | `_dmarc.notetonmaster.fr`                 | `v=DMARC1; p=quarantine; rua=mailto:dmarc@notetonmaster.fr; adkim=s; aspf=s` |

Passer à `p=reject` après quelques semaines de rapports DMARC sans échec légitime.

## Mises à jour automatiques

Dependabot ouvre chaque semaine des pull requests (npm et GitHub Actions, regroupées) qui passent
par la même CI. **La fusion automatique n'est pas activée.** Proposition : fusionner
automatiquement les seuls correctifs de sécurité de Dependabot quand toute la CI est verte
(`gh pr merge --auto --squash` depuis un workflow limité aux pull requests de `dependabot[bot]`).
À activer seulement après accord.

## Réglages GitHub (à faire une fois, par la personne qui administre le dépôt)

- **Branche `main` protégée** (Settings › Rules › Rulesets) :
  - pull request obligatoire, au moins une revue approuvée ;
  - pas de push direct, pas de force push, historique linéaire ;
  - vérifications obligatoires, avec ces noms exacts : `lint-type`, `unit`, `integration`,
    `migrations`, `e2e`, `security`, `build-budget`, `seo` ;
  - le job `seo` est sauté quand une pull request ne touche pas le site public : GitHub compte un
    job sauté comme réussi, il peut donc rester obligatoire.
- **Code security** : _Secret scanning_ et _Push protection_ activés ; _Dependabot alerts_ et
  _Dependabot security updates_ activés ; _Private vulnerability reporting_ activé (SECURITY.md).
- **Code scanning** : une fois le dépôt public, activer CodeQL en _Default setup_ (il n'est pas dans
  la CI : sur un dépôt privé sans GitHub Advanced Security, ses résultats ne peuvent pas être
  envoyés). Ne jamais l'ajouter aussi à un workflow : GitHub refuse les analyses d'un workflow
  quand la configuration par défaut est active. L'étape « Nouvelles dépendances » du job `security`
  ne tourne elle aussi que sur un dépôt public.
- **Actions** : _Fork pull request workflows_ : demander une approbation pour les contributions
  extérieures ; aucun secret dans les variables d'Actions (la CI n'en a besoin d'aucun). Si un
  secret devient nécessaire, le placer dans un _environment_ protégé, jamais au niveau du dépôt.
- **Variable de dépôt** `SITE_LIVE=true` une fois le site en ligne : active la fumée nocturne sur
  notetonmaster.fr (workflow `nightly.yml`).
- **Libellés** à créer : `migration validée`, `sécurité`, `dépendances`.
