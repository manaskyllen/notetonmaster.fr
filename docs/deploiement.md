# Déploiement de notetonmaster.fr

Le déploiement est **manuel** : aucun workflow ne déploie, il n'y a pas de préproduction. La
production est `https://notetonmaster.fr`, sur un VPS qui fait tourner d'autres applications.

Sommaire : [Architecture](#architecture) · [Passerelle Caddy](#passerelle-caddy) ·
[Variables](#variables-envprod) · [Premier déploiement](#premier-déploiement) ·
[Mettre à jour](#mettre-à-jour) · [Ouvrir les villes](#lancement--toutes-les-villes-fermées) ·
[Sauvegardes](#sauvegardes) · [Restaurer après une panne](#restaurer-après-une-panne) ·
[Mails](#mails) · [Serveur](#serveur) · [Plus tard](#plus-tard)

## Architecture

- Une **passerelle Caddy**, commune à toutes les applications du serveur, vit dans son propre
  projet Compose (`/opt/gateway`, hors de ce dépôt). Elle seule occupe les ports 80 et 443, termine
  le HTTPS et joint les applications par le réseau Docker externe `gateway`.
- **Règle de la passerelle** : d'une application, seul le service web rejoint `gateway`, sous un
  alias unique (`notetonmaster-app`), sans aucun port publié sur l'hôte.
- `docker-compose.prod.yml`, projet `notetonmaster` (nom fixe : conteneurs, volumes et réseaux
  `notetonmaster_*`, jamais en collision avec une autre application) :
  - `postgres` (PostgreSQL 17, comme en CI), `app` (serveur Next.js standalone), `worker` (tâches et
    collecte), et `migrate`, lancé une fois par déploiement avec le compte propriétaire de la base ;
  - un réseau interne propre ; seul `app` rejoint aussi le réseau du proxy (`PROXY_NETWORK`) ;
  - **aucun port publié** : PostgreSQL n'est joignable que depuis le réseau interne ;
  - limites de mémoire et de processeur sur `app`, `worker` et `postgres` (`.env.prod`), pour
    qu'une synchro lourde ne gêne pas les autres applications ;
  - l'état vit dans des volumes nommés : `pgdata` (base), `uploads` (justificatifs) et `rawdata`
    (fichiers bruts téléchargés par la collecte, refaits par la synchro suivante, non sauvegardés) ;
  - journaux Docker en rotation (`json-file`, `LOG_MAX_SIZE` × `LOG_MAX_FILE` par conteneur).
- Pas de Redis ni de S3 : la file de tâches et les limites anti-abus sont dans PostgreSQL, les
  justificatifs dans le volume `uploads`.

> **Pas encore de reverse proxy sur le serveur ?** Créer le réseau (`docker network create
gateway`), lancer un Caddy dans son propre projet Compose sur ce réseau, ports 80 et 443, avec un
> `Caddyfile` qui contient `import sites/*.caddy`, puis y copier `deploy/caddy/notetonmaster.caddy`
> comme ci-dessous. C'est la seule hypothèse du dépôt sur l'infrastructure.

> **Un CDN devant la passerelle, un jour ?** Configurer alors `trusted_proxies` dans Caddy avec les
> plages du CDN, et revoir la lecture de l'IP : `TRUST_CLOUDFLARE=true` pour Cloudflare, ou
> `TRUSTED_PROXY_HOPS`. Sinon les limites de débit et le journal de connexion se fondent sur
> l'adresse du CDN.

### En-têtes : qui envoie quoi

- **HSTS** est envoyé **par l'application** (`next.config.ts`), seulement quand `APP_URL` est en
  HTTPS : `max-age=31536000; includeSubDomains`, sans `preload` pour l'instant. **Caddy n'en ajoute
  pas un second.**
- La CSP (avec nonce), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, COOP et CORP viennent aussi de l'application. Caddy n'en ajoute aucun.
- L'IP du client : Caddy, sans `trusted_proxies`, **remplace** `X-Forwarded-For` par l'adresse
  réelle du client ; l'application lit le dernier élément (`TRUSTED_PROXY_HOPS=1`, `lib/ip.ts`).

## Passerelle Caddy

Le site est décrit dans [`deploy/caddy/notetonmaster.caddy`](../deploy/caddy/notetonmaster.caddy),
la référence à copier dans `/opt/gateway/conf/sites/`. Ses règles :

- pas de `trusted_proxies` (voir ci-dessus) ;
- pas de HSTS ni d'autre en-tête de sécurité : l'application les envoie ;
- pas de directive `log` : aucun journal d'accès pour ce site ;
- `request_body max_size 11MiB` : la plus grosse requête de l'application, un justificatif de
  10 Mio plus l'enveloppe multipart (`app/api/espace/justificatif/route.ts`) ;
- `reverse_proxy notetonmaster-app:3000` (le port interne de `app`) et `import maintenance`
  (bloc défini dans le `Caddyfile` de la passerelle : page de maintenance sur 502, 503, 504).

Mettre à jour le fichier sur le serveur, après un déploiement qui le modifie :

```sh
cp /opt/notetonmaster/deploy/caddy/notetonmaster.caddy /opt/gateway/conf/sites/
cd /opt/gateway && ./reload.sh      # valide, puis recharge sans coupure
```

Puis vérifier, depuis ton ordinateur, à la racine du dépôt :

```sh
read -rs NM_ADMIN_COOKIE && export NM_ADMIN_COOKIE   # valeur du cookie __Host-nm_admin, connecté à l'admin
docker compose run --rm --no-deps -e NM_ADMIN_COOKIE app pnpm proxy:check https://notetonmaster.fr
```

`proxy:check` contrôle les en-têtes de sécurité (un seul HSTS), les redirections (http → https,
`www.` et `.com` → `https://notetonmaster.fr`, même chemin), et que l'application voit ta vraie
adresse et ignore un `X-Forwarded-For` écrit par le client (route `/api/admin/diagnostic/ip`,
réservée aux admins). Ajouter `--expect-ip=<ton IP publique>` pour une comparaison exacte.

## Variables (`.env.prod`)

La liste complète, commentée, est dans [`.env.prod.example`](../.env.prod.example). Sur le serveur :
`cp .env.prod.example .env.prod && chmod 600 .env.prod`, puis remplacer chaque valeur factice.
**Garder `.env.prod` dans un gestionnaire de mots de passe** : sans la même `APP_ENCRYPTION_KEY`,
une sauvegarde restaurée ne peut plus lire les données chiffrées. Il n'est jamais commité.

| Variable                                     | Comment la produire                                             |
| -------------------------------------------- | --------------------------------------------------------------- |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`       | `openssl rand -hex 32` (hexadécimal : ils entrent dans une URL) |
| `SESSION_SECRET`                             | `openssl rand -base64 48`                                       |
| `APP_ENCRYPTION_KEY`                         | `openssl rand -base64 32`                                       |
| `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`        | adresse du domaine créée chez OVH (voir [Mails](#mails))        |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare › Turnstile, hôte `notetonmaster.fr`                 |
| `CRAWLER_INFO_URL`, `CRAWLER_CONTACT_EMAIL`  | page qui présente le robot, adresse de contact du robot         |
| `BACKUP_AGE_RECIPIENT`                       | clé publique age (voir [Sauvegardes](#sauvegardes))             |
| `INDEXNOW_KEY`                               | `openssl rand -hex 16`                                          |

Le serveur refuse de démarrer (`lib/env.ts`) avec une variable manquante ou une valeur factice de
`.env.prod.example`, `DEMO_DATA`, `SEED_ON_START=true`, `CONNECTORS_MODE` autre que `live`,
`TURNSTILE_MODE=mock`, les clés de test Turnstile, les secrets de `.env.example`, un `APP_URL` en
`http://`, `ALLOW_INSECURE_LOCAL_PROD`, ou sans l'identité du robot (`CRAWLER_INFO_URL` en
`https://` et `CRAWLER_CONTACT_EMAIL`, envoyées dans le User-Agent de chaque requête de la
collecte). Au démarrage, le site refuse aussi une base qui contient des données de démo
(`lib/auth/demo.ts`).

Les commandes Compose prennent toujours ce fichier :

```sh
docker compose --env-file .env.prod -f docker-compose.prod.yml <commande>
```

## Premier déploiement

Dans l'ordre. Le dépôt est cloné dans `/opt/notetonmaster` (chemin d'exemple).

**1. Sur le serveur**

- [ ] Préparer le serveur : section [Serveur](#serveur) (pare-feu, SSH, mises à jour, Docker).
- [ ] `sudo apt install age` (chiffrement des sauvegardes).
- [ ] `git clone` du dépôt dans `/opt/notetonmaster`, sur `main`.
- [ ] Sur ton ordinateur : `age-keygen -o notetonmaster-backup.key`, garder ce fichier (clé privée)
      dans le gestionnaire de mots de passe ; **il ne va jamais sur le serveur**.
- [ ] `.env.prod` depuis `.env.prod.example` (tableau ci-dessus), `chmod 600`, `PUBLIC_INDEXING=false`,
      `BACKUP_AGE_RECIPIENT` = la clé publique affichée par `age-keygen`.
- [ ] Dossier des sauvegardes : `sudo install -d -m 700 -o "$USER" /var/backups/notetonmaster`.
- [ ] `scripts/deploy.sh` : images, migrations sur la base vide, démarrage, santé.
- [ ] `docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate pnpm admin:create --email <ton adresse> --role ADMIN`
- [ ] Sauvegarde nocturne dans la crontab (voir [Sauvegardes](#sauvegardes)).
- [ ] `ss -tlnp` : aucun port 5432, ni 3000.

**2. Dans la passerelle Caddy (`/opt/gateway`)**

- [ ] Le réseau `gateway` existe déjà (`docker network ls`).
- [ ] Copier `deploy/caddy/notetonmaster.caddy` dans `/opt/gateway/conf/sites/`, puis `./reload.sh`.

**3. Dans les DNS**

- [ ] `A` (et `AAAA` si le serveur a une IPv6) pour `notetonmaster.fr`, `www.notetonmaster.fr`,
      `notetonmaster.com` et `www.notetonmaster.com`, vers le serveur. Les certificats sont pris
      par Caddy à la première requête.
- [ ] Enregistrements mail : SPF, DKIM, DMARC (section [Mails](#mails)).

**4. Chez OVH, pour les mails**

- [ ] Créer l'adresse d'envoi (ex. `ne-pas-repondre@notetonmaster.fr`), reporter son mot de passe
      dans `SMTP_PASS`.
- [ ] Activer DKIM pour le domaine, ajouter les enregistrements donnés.
- [ ] `pnpm mail:test --to <ton adresse>` (section [Mails](#mails)) : arrivé, SPF/DKIM/DMARC à
      « pass ».

**5. Dans l'admin, avant d'ouvrir les villes**

- [ ] Ouvrir le lien d'invitation, choisir le mot de passe, configurer la double authentification,
      ranger les codes de secours.
- [ ] `pnpm proxy:check https://notetonmaster.fr` depuis ton ordinateur.
- [ ] Compléter les pages légales de `content/legal/` (éditeur, hébergeur, contacts) si besoin.
- [ ] La liste [Lancement](#lancement--toutes-les-villes-fermées) ci-dessous, dans l'ordre.
- [ ] Une sonde externe sur `https://notetonmaster.fr/api/health` (section [Serveur](#serveur)).

## Mettre à jour

`main` est protégée : tout ce qui y arrive est passé par la CI complète. Sur le serveur :

```sh
cd /opt/notetonmaster && scripts/deploy.sh
```

[`scripts/deploy.sh`](../scripts/deploy.sh) :

1. refuse si l'arbre a des modifications locales (ou n'est pas sur `main`) ;
2. `git pull --ff-only` ;
3. construit les images, étiquetées avec le SHA du commit (`notetonmaster:<sha>`, et `:latest`) ;
4. sauvegarde rapide de la base avant les migrations (`backup.sh --pre-deploy`, 3 gardées dans
   `/var/backups/notetonmaster/pre-deploy/`) ;
5. lance le service `migrate` : export des tables supprimées par une migration, `prisma migrate
deploy`, droits du rôle `nm_app`, bootstrap (réglages, domaines, sources ; jamais de données de
   démo, jamais de compte) ;
6. `up -d` de `postgres`, `app` et `worker` ;
7. attend que `/api/health` réponde et affiche la version déployée (le SHA) ;
8. supprime les anciennes images de notetonmaster en gardant les 2 dernières. Il ne touche à aucune
   autre image : jamais de `docker system prune`.

Une migration qui supprime une table ou une colonne passe par une pull request avec le libellé
« migration validée » (job `migrations`) : vérifier que la sauvegarde de l'étape 4 s'est bien faite.

Si le site ne démarre pas, les journaux disent pourquoi (variable refusée, données de démo…) :
`docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail 100 app`.

### Revenir en arrière

Redéployer l'image du commit précédent, encore présente (les 2 dernières sont gardées) :

```sh
docker image ls notetonmaster                  # le SHA précédent
export IMAGE_TAG=<sha précédent>
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d app worker
docker tag notetonmaster:$IMAGE_TAG notetonmaster:latest
```

Puis corriger `main` (revert par pull request) et redéployer normalement. Si la version fautive
contenait une **migration** incompatible : arrêter `app` et `worker`, renommer la base cassée
(`ALTER DATABASE notetonmaster RENAME TO notetonmaster_casse`, puis `CREATE DATABASE notetonmaster`
depuis `psql -d postgres`), et restaurer la sauvegarde d'avant déploiement
(`scripts/restore.sh /var/backups/notetonmaster/pre-deploy/<date>`, voir plus bas). Les avis écrits
entre la sauvegarde et la restauration sont perdus : à annoncer dans le bandeau.

## Lancement : toutes les villes fermées

On n'importe pas de base locale : la production part **vide**, et les synchros et réglages se font
depuis l'admin de production.

- Une base neuve démarre avec **toutes les villes fermées** (migration
  `launch_zones_closed_on_empty_base`, bootstrap) et **sans aucune donnée de démo** : ni avis, ni
  étudiant, ni compte. L'accueil, Explorer, les index, le sitemap et les pages 404 fonctionnent sur
  cette base vide (testé par `scripts/test-deploy.sh`).
- **`PUBLIC_INDEXING=false`** (défaut) : `robots.txt` interdit tout, `X-Robots-Tag: noindex` sur
  toutes les pages, sitemaps vides, IndexNow muet. À passer à `true` en ouvrant les villes.
- **Premier compte** : `pnpm admin:create`, dans le conteneur :

  ```sh
  docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate \
    pnpm admin:create --email <adresse> --role ADMIN    # ou MODERATOR, DATA_EDITOR, LEGAL
  ```

  Il crée le compte sans mot de passe et envoie un lien d'invitation à usage unique, valable 7
  jours. Le mot de passe se choisit sur cette page, la double authentification est obligatoire à
  la première connexion. Aucun mot de passe en ligne de commande ni dans les journaux, et le lien
  n'est jamais affiché. Les comptes suivants s'invitent depuis Administration › Équipe.

- **Synchros** : en production, `CONNECTORS_MODE=live` est obligatoire (les vrais connecteurs), et
  l'identité du robot aussi.

Dans l'admin, **dans cet ordre**, avant d'ouvrir :

1. **Lancer chaque source** (Administration › Récupération), en commençant par les établissements
   (elle apporte aussi la liste des communes), puis Mon Master et les autres ; valider chaque
   simulation avant de l'appliquer.
2. **Traiter les conflits et les doublons** proposés par les synchros.
3. **Montbéliard** : vérifier ses fiches (ville renommée, `/masters/montbeliar` redirige).
4. **Établissements privés masqués** : vérifier le secteur public / privé des établissements.
5. **Ouvrir Strasbourg, Mulhouse et Nantes** (Paramètres › Villes ouvertes).
6. **Passer `PUBLIC_INDEXING` à `true`** dans `.env.prod`, puis
   `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d app worker`, et
   `pnpm smoke --url=https://notetonmaster.fr` (il vérifie l'état d'indexation, ouvert ou fermé).

## Sauvegardes

Le serveur héberge plusieurs applications : une panne de disque les emporterait toutes. **La copie
hors du serveur est obligatoire.**

[`scripts/backup.sh`](../scripts/backup.sh), chaque nuit :

- `pg_dump -Fc` de la base, **sans les données reconstructibles** : index de recherche (table et
  vue), pages brutes collectées et données de travail des synchros, compteurs anti-abus, journal
  des lectures d'avis, journal Turnstile (`REBUILT_TABLES`, `scripts/prod-env.sh`) ;
- une archive du volume `uploads` (justificatifs) ;
- le tout chiffré avec `age` pour `BACKUP_AGE_RECIPIENT` : la clé privée n'est **jamais** sur le
  serveur ;
- 7 sauvegardes gardées dans `/var/backups/notetonmaster/daily/<date>/`, avec `counts.txt` (chiffres
  seulement, comparés à la restauration).

Crontab de l'utilisateur qui déploie (membre du groupe `docker`), à une heure calme pour les autres
applications :

```cron
40 3 * * * cd /opt/notetonmaster && scripts/backup.sh 2>&1 | logger -t notetonmaster-backup
```

Journal : `journalctl -t notetonmaster-backup`.

**Copie hors du serveur**, depuis ton ordinateur, chaque semaine (les fichiers sont déjà chiffrés) :

```sh
rsync -av <utilisateur>@<serveur>:/var/backups/notetonmaster/ ~/Sauvegardes/notetonmaster/
```

Sans `--delete` : les sauvegardes s'accumulent sur l'ordinateur, à élaguer de temps en temps. Si le
serveur a déjà une sauvegarde externe, y ajouter le dossier `/var/backups/notetonmaster/` (et rien
d'autre de notetonmaster : `.env.prod` est dans le gestionnaire de mots de passe).

## Restaurer après une panne

[`scripts/restore.sh`](../scripts/restore.sh) restaure dans une **base vide** (il refuse sinon) :
déchiffrement, `pg_restore`, migrations postérieures et droits des rôles, justificatifs,
reconstruction de ce qui n'était pas sauvegardé (index de recherche, notes et compteurs des
parcours, des mentions, des établissements et des villes ; les sitemaps suivent), puis une
vérification qui affiche les chiffres (avis, parcours publiés, villes ouvertes…) et échoue si la
base est incohérente. La clé privée arrive par l'entrée standard et ne vit qu'en mémoire.

- [ ] Nouveau serveur prêt : section [Serveur](#serveur), `age`, passerelle Caddy et réseau `gateway`.
- [ ] `git clone` du dépôt dans `/opt/notetonmaster`.
- [ ] `.env.prod` recopié depuis le gestionnaire de mots de passe (**même `APP_ENCRYPTION_KEY`**).
- [ ] La dernière sauvegarde recopiée depuis ton ordinateur :
      `rsync -av ~/Sauvegardes/notetonmaster/daily/<date> <utilisateur>@<serveur>:/var/backups/notetonmaster/daily/`
- [ ] Les images : `docker compose --env-file .env.prod -f docker-compose.prod.yml build app migrate`
- [ ] La restauration, depuis ton ordinateur :
      `ssh <utilisateur>@<serveur> 'cd /opt/notetonmaster && scripts/restore.sh /var/backups/notetonmaster/daily/<date>' < notetonmaster-backup.key`
- [ ] Les chiffres affichés sont ceux de `counts.txt`, « base cohérente », site en ligne.
- [ ] DNS vers le nouveau serveur si l'adresse a changé ; `deploy/caddy/notetonmaster.caddy` copié
      dans la passerelle, `./reload.sh`.
- [ ] `pnpm proxy:check` et `pnpm smoke` sur `https://notetonmaster.fr`.
- [ ] Un justificatif s'ouvre dans l'admin (Modération › Justificatifs).
- [ ] Relancer la source des établissements (liste des communes : lieux complets dans l'index).
- [ ] Remettre la sauvegarde nocturne dans la crontab.

**Une fois par trimestre, un test de restauration complet en local** : copier une sauvegarde sur ton
ordinateur, puis, à la racine du dépôt, avec un `.env.restore-test` (copie de `.env.prod` avec
`APP_URL=http://app:3000`, `ALLOW_INSECURE_LOCAL_PROD=1`, `TURNSTILE_MODE=mock`,
`CONNECTORS_MODE=mock`, `SMTP_HOST=` vide) :

```sh
docker network create gateway 2>/dev/null || true
export ENV_FILE=.env.restore-test COMPOSE_PROJECT_NAME=nm-restore-test
docker compose -p nm-restore-test --env-file .env.restore-test -f docker-compose.prod.yml build app migrate
scripts/restore.sh ~/Sauvegardes/notetonmaster/daily/<date> < notetonmaster-backup.key
docker compose -p nm-restore-test --env-file .env.restore-test -f docker-compose.prod.yml down -v
```

Noter la date et les chiffres restaurés dans le CHANGELOG. `scripts/test-deploy.sh` (job CI
`deploiement`) fait aussi une sauvegarde puis une restauration sur une base de démonstration, et
vérifie les mêmes chiffres avant et après.

## Mails

Envoi par le SMTP d'OVH, depuis une adresse du domaine (`SMTP_HOST=ssl0.ovh.net`, port 465,
`SMTP_USER` = l'adresse, `MAIL_FROM` = la même). Enregistrements DNS de `notetonmaster.fr` :

| Type  | Nom                                       | Valeur                                                                 |
| ----- | ----------------------------------------- | ---------------------------------------------------------------------- |
| TXT   | `notetonmaster.fr`                        | `v=spf1 include:mx.ovh.com -all`                                       |
| CNAME | `<sélecteur>._domainkey.notetonmaster.fr` | donné par OVH à l'activation de DKIM (espace client › E-mails › DKIM)  |
| TXT   | `_dmarc.notetonmaster.fr`                 | `v=DMARC1; p=none; rua=mailto:dmarc@notetonmaster.fr; adkim=s; aspf=s` |

- `p=none` au début : les rapports arrivent à `dmarc@notetonmaster.fr` (adresse ou alias à créer)
  sans rien bloquer. Après quelques semaines sans échec légitime : `p=quarantine`, puis `p=reject`.
- Mail de test, depuis le conteneur :

  ```sh
  docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate \
    pnpm mail:test --to <ton adresse>
  ```

  Dans les en-têtes du mail reçu : `spf=pass`, `dkim=pass`, `dmarc=pass`.

## Serveur

Dans la doc seulement : rien de cela n'est scripté.

- **PostgreSQL n'est pas exposé** : `sudo ss -tlnp` ne montre ni `:5432` ni `:3000`, seulement 22,
  80 et 443 (et ce qu'exposent les autres applications).
- **Pare-feu** : 22, 80 et 443 seulement (`ufw default deny incoming`, `ufw allow 22,80,443/tcp`,
  `ufw allow 443/udp` pour HTTP/3, `ufw enable`). Docker contourne `ufw` pour les ports publiés :
  raison de plus pour n'en publier aucun.
- **SSH par clé uniquement** : `PasswordAuthentication no`, `PermitRootLogin prohibit-password` (ou
  `no`) dans `/etc/ssh/sshd_config`, puis `sudo systemctl reload ssh`.
- **Mises à jour de sécurité automatiques** : `sudo apt install unattended-upgrades`, puis
  `sudo dpkg-reconfigure -plow unattended-upgrades`.
- **Docker et Compose à jour** : dépôt officiel de Docker, `docker compose version` ≥ 2.24.
- **Sonde externe gratuite** (UptimeRobot ou équivalent) : HTTP(S) sur
  `https://notetonmaster.fr/api/health`, toutes les 5 minutes, alerte par mail. Aucun code.

## Vérifications après un déploiement

Depuis ton ordinateur, à la racine du dépôt (lectures seulement, rien n'est créé en production) :

```sh
docker compose run --rm --no-deps app pnpm smoke --url=https://notetonmaster.fr
docker compose run --rm --no-deps -e NM_ADMIN_COOKIE app pnpm proxy:check https://notetonmaster.fr
docker compose run --rm --no-deps app pnpm seo:check --url=https://notetonmaster.fr   # une fois l'indexation ouverte
docker compose run --rm --no-deps app pnpm links --url=https://notetonmaster.fr
```

Chacun affiche ✅ ou ❌ et renvoie un code d'erreur en cas d'échec. Les mêmes commandes, avec
`--url=http://localhost:3002`, servent **avant** sur `make prod-local`. Ajouter ensuite une entrée
dans `CHANGELOG.md`.

## Mises à jour automatiques

Dependabot ouvre chaque semaine des pull requests (npm et GitHub Actions, regroupées) qui passent
par la même CI. `@types/node` ne monte pas de version majeure : il suit Node.js de la production
(`NODE_VERSION` du Dockerfile). **La fusion automatique n'est pas activée.**

## Réglages GitHub (à faire une fois, par la personne qui administre le dépôt)

- **Branche `main` protégée** (Settings › Rules › Rulesets) :
  - pull request obligatoire, au moins une revue approuvée ;
  - pas de push direct, pas de force push, historique linéaire ;
  - vérifications obligatoires, avec ces noms exacts : `lint-type`, `unit`, `integration`,
    `migrations`, `e2e`, `security`, `build-budget`, `seo`, `deploiement` ;
  - les jobs `seo` et `deploiement` sont sautés quand une pull request ne touche pas ce qu'ils
    vérifient : GitHub compte un job sauté comme réussi, ils peuvent donc rester obligatoires.
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

## Plus tard

Pas maintenant, volontairement (minimum fiable au lancement) :

- scripts de base de lancement (`launch:db:*`) : la production part vide, tout se fait dans l'admin ;
- `rollback.sh`, `infra:check`, `deploy:check` : le retour en arrière tient en quelques lignes
  ci-dessus, et `main` protégée garantit une CI verte ;
- alerte disque ;
- Redis, S3, sauvegarde continue (WAL) ;
- préproduction ;
- déploiement automatique.
