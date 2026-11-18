# Mise en ligne sur notetonmaster.fr : référencement

À faire le jour du passage en production, dans l’ordre. Compter une heure, plus l’attente DNS.

## 1. Variables d’environnement

| Variable       | Valeur                     | Effet                                                                                                                                                                    |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `APP_URL`      | `https://notetonmaster.fr` | Seule valeur qui rend le site indexable. Canoniques, sitemaps, Open Graph et JSON-LD en dépendent. Toute autre valeur : `noindex, nofollow` partout, `robots.txt` fermé. |
| `INDEXNOW_KEY` | 32 caractères aléatoires   | Active IndexNow (Bing, Yandex…). Générer : `openssl rand -hex 16`. La clé est servie sur `/<clé>.txt`.                                                                   |
| `SEO_SAME_AS`  | facultatif                 | Comptes officiels (URL `https://…` séparées par des virgules) ajoutés à `Organization.sameAs`. Laisser vide tant qu’il n’y en a pas.                                     |

`APP_URL` est lu à l’exécution, pas au build : la même image sert en local, en CI et en production.

## 2. DNS et redirections

- `notetonmaster.fr` (A / AAAA) vers l’hébergeur, proxifié par Cloudflare.
- `www.notetonmaster.fr`, `notetonmaster.com`, `www.notetonmaster.com` : même cible (CNAME ou A). Le site renvoie lui-même un **301** vers `https://notetonmaster.fr` en gardant le chemin et les paramètres (`proxy.ts`, `lib/seo/site.ts`).
- Cloudflare : SSL/TLS en mode **Full (strict)**, « Always Use HTTPS » activé. Le site redirige aussi `http` → `https` s’il reçoit `X-Forwarded-Proto: http`.
- Majuscules et barre oblique finale : 301 vers la forme canonique, par le site (`/Mentions/Droit/` → `/mentions/droit`).

Vérifications (chaque ligne doit afficher `301` puis l’adresse canonique) :

```sh
for u in http://notetonmaster.fr/explorer https://www.notetonmaster.fr/explorer \
         https://notetonmaster.com/explorer https://www.notetonmaster.com/explorer \
         https://notetonmaster.fr/Explorer https://notetonmaster.fr/explorer/; do
  curl -s -o /dev/null -w "%{http_code} $u → %{redirect_url}\n" "$u"
done
curl -sI https://notetonmaster.fr/ | grep -i x-robots-tag   # rien : la page est indexable
curl -s https://notetonmaster.fr/robots.txt                 # Allow /, Disallow des zones privées, Sitemap
curl -s https://notetonmaster.fr/$INDEXNOW_KEY.txt          # affiche la clé
```

## 3. Google Search Console

1. <https://search.google.com/search-console> › Ajouter une propriété › **Domaine** : `notetonmaster.fr` (couvre http, https, www et sous-domaines).
2. Copier l’enregistrement **TXT** `google-site-verification=…` et l’ajouter dans la zone DNS (Cloudflare › DNS › Add record › TXT, nom `@`). Valider (quelques minutes, jusqu’à 48 h).
3. Ajouter aussi une propriété **Domaine** `notetonmaster.com` (même méthode), pour suivre les redirections.
4. Sitemaps › soumettre `https://notetonmaster.fr/sitemap.xml` (l’index : les cinq sitemaps qu’il liste sont lus avec lui).
5. Inspection d’URL sur l’accueil, une page ville (`/masters/nantes`) et une fiche : « Tester l’URL en ligne », vérifier que la page est indexable et que les données structurées (Fil d’Ariane) sont détectées, puis « Demander une indexation ».

## 4. Bing Webmaster Tools

1. <https://www.bing.com/webmasters> › Importer depuis Google Search Console (le plus simple), ou ajouter `https://notetonmaster.fr` et vérifier par enregistrement **CNAME** DNS (valeur donnée par Bing).
2. Sitemaps › soumettre `https://notetonmaster.fr/sitemap.xml`.
3. IndexNow : rien à configurer chez Bing. Le site met en file les fiches modifiées (avis publié ou retiré, fiche publiée) et le worker les envoie à `api.indexnow.org` au plus une fois par minute (`lib/seo/indexnow.ts`). Contrôle : table `Job`, type `indexnow`, statut `DONE` ; Bing › IndexNow affiche les URL reçues.

## 5. Contrôles après le déploiement

Depuis un poste avec le dépôt (ou le conteneur `app`) :

```sh
pnpm seo:check -- --url=https://notetonmaster.fr          # 3 requêtes à la fois en production
LHCI_BASE_URL=https://notetonmaster.fr npx @lhci/cli@0.14.0 autorun --config=lighthouserc.cjs
```

Les deux doivent finir sans erreur. En production, le contrôle vérifie en plus que rien n’est `noindex` dans le sitemap et que `robots.txt` n’interdit pas tout.

Puis :

- [Test des résultats enrichis](https://search.google.com/test/rich-results) sur une fiche, une mention, une université, une page ville : `BreadcrumbList` valide, aucun avertissement bloquant (voir `validation.md`).
- [Validateur schema.org](https://validator.schema.org/) sur une fiche : `EducationalOccupationalProgram`, `CollegeOrUniversity`, `Organization`, `WebSite`, `BreadcrumbList` sans erreur.
- Partage : coller une fiche dans le [débogueur de partage LinkedIn](https://www.linkedin.com/post-inspector/) ou un message privé pour voir l’image Open Graph.

## 6. Dans les semaines qui suivent

- Search Console › Pages : surveiller « Explorée, actuellement non indexée » sur les fiches sans avis ni programme (voir `audit.md`, « Fiches minces »).
- Search Console › Améliorations : fil d’Ariane sans erreur.
- À chaque ouverture ou fermeture de ville : rien à faire, les pages ville et le sitemap suivent (cache de 10 min à 1 h). Une ville fermée répond 404, Google la retire seul.
