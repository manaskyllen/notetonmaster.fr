# `univ-sites` — sites des 3 universités pilotes

Reconnaissance du 13/11/2026, une dizaine de requêtes au total, espacées d'au moins 2 secondes, avec le User-Agent `notetonmasterBot/1.0 (recon)`. Pages de test : `fixtures/live/univ-sites/` (pages fictives aux gabarits des CMS, aucun contenu réel ; les `robots.txt` publics sont copiés tels quels).

## Université Paris-Saclay — accessible, modèle `GENERIC_HTML` (Drupal)

- `robots.txt` (`www.universite-paris-saclay.fr`) : règles Drupal standard (`/user/*`, `/search/`, `/node/add/`…). Pas de `Crawl-delay`, pas de `Sitemap` déclaré. Les pages `/formation/…` sont autorisées. `/.well-known/tdmrep.json` est absent. Aucun en-tête `X-Robots-Tag` ni `tdm-reservation`.
- Réponses avec `ETag` et `Last-Modified` : les requêtes conditionnelles fonctionneront.
- Pas de marqueur Ametys ni d'export ODF/CDM-fr trouvé.
- Structure : une page par mention (`/formation/master/culture-patrimoine-et-mediation`) qui liste une page par parcours **et par année** (`m1-administration-culturelle/projets-culturels-internationaux`, `m1-evenementiel-mediation-des-arts-et-des-sciences`, `m2-administration-culturelle`, `m2-evenementiel-…`, `m2-projets-culturels-internationaux`). Un schéma de la mention en PDF est aussi lié.
- Page d'un parcours : bloc `.capacity` (« Capacité d'accueil · Places · **24** » pour EMAS M1, contre 22 sur Mon Master : le conflit du seed est confirmé), bloc « Lieu(x) d'enseignement » (VERSAILLES), blocs `field--name-field-titre-monmaster` et `field--name-field-titre-inception` (calendriers de candidature), contacts en `field--name-field-poste` (rôle) **et noms de personnes** : à filtrer.
- **Les cours sont chargés en AJAX** : `GET /node/<id>/program-courses-ajax` renvoie du JSON (commandes Drupal) contenant un tableau HTML : intitulé, ECTS, semestre, heures de cours, TD, TP… Exemple EMAS M1 : « Approches historiques et perspectives des politiques culturelles · 4 ECTS · S1 · 24 h ». Les identifiants `node/<id>` se lisent dans la page du parcours (`program-courses-ajax-placeholder-<id>`). C'est une URL simple, sans JavaScript à exécuter et autorisée par le `robots.txt` : le profil peut la déclarer comme seconde URL à lire.

## Nantes Université — sites publics des UFR (K-Sup)

- `formations.univ-nantes.fr` est **abandonné** : il est mal configuré pour tout le monde (redirection vers le CAS, erreur « application non autorisée »), ce n'est pas un blocage propre à notre robot.
- `www.univ-nantes.fr` (K-Sup 7.2.1) : son sitemap (2 451 URL) ne contient aucune page de formation.
- Le profil passe par les **sites publics des UFR**, tous en K-Sup avec le même `robots.txt` (vérifié le 13/11/2026, copies dans `fixtures/live/univ-sites/nantes/`) : `User-agent: *`, `Disallow` techniques seulement (`/adminsite/`, `/search`, `/servlet/search`, `/action/*`…), `Sitemap: https://<hôte>/seo/sitemap.xml`, pas de `tdmrep.json` (404).
  - `histoire.univ-nantes.fr` : par exemple `/offre-de-formation/offre-de-formation/fiche-formation-master-ccs-hacm` et `/livret-pedagogique-master-ccs-parcours-vnp` ;
  - `flce.univ-nantes.fr` : par exemple `/offre-de-formation/master-ccs` ;
  - `sociologie.univ-nantes.fr`.
- Découverte : sitemap de chaque sous-domaine, ou depuis les pages « offre de formation » de l'UFR. **Jamais d'hôte de test** (`*.testksup.univ-nantes.fr`), exclu par la liste blanche des domaines.
- Ces pages décrivent encore l'ancienne mention « Civilisations, cultures et sociétés » (livret VNP 2022-2023) : elles sont reliées aux parcours actuels par les propositions « succède à », et leurs champs passent `STALE` selon l'année du document.
- Les fiches nomment les responsables et les secrétariats, avec leurs mails et téléphones : le filtre de données personnelles les retire, seul le rôle est gardé.
- Les anciens sites de composantes (`www.lettreslangages.univ-nantes.fr`, encore cités par l'Onisep) ont un certificat invalide : ils ne sont pas utilisés.

## Université de Reims Champagne-Ardenne — injoignable depuis ce poste

- `www.univ-reims.fr` : l'IPv6 est injoignable, et en IPv4 la négociation TLS n'aboutit pas (expiration à 30 puis 60 s, en TLS 1.2 comme 1.3). `http://` redirige bien vers `https://`.
- Retest du 13/11/2026 depuis le conteneur du worker : erreur Node `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, c'est-à-dire que le serveur n'envoie pas son certificat intermédiaire (un navigateur le complète seul par l'extension AIA, Node non). Ce n'est pas un blocage de notre robot. Aucun contournement n'est fait ; la question est à reprendre au jalon 8 depuis le serveur.
- Le même poste a eu d'autres soucis TLS pendant la session (geo.api.gouv.fr, revenu à la normale depuis le conteneur). Il faut refaire le test depuis le serveur de production avant de conclure.
- Rien n'est donc connu de la technologie du site URCA : la détection (`ODF_XML`, `AMETYS_ODF`, `PDF_BOOKLET`) est reportée au jalon 8, depuis le serveur. Aucun contournement TLS. Si le site reste inaccessible, le profil passe « En pause » avec le motif et les champs de programme restent `MISSING`.

## Ce que ça change pour le §6

- Les modèles `AMETYS_ODF` et `ODF_XML` ne sont confirmés sur aucun site pilote accessible. Nantes relève d'un modèle K-Sup (`GENERIC_HTML` + livrets `PDF_BOOKLET`). Le modèle utile tout de suite est `GENERIC_HTML` avec une **seconde URL déclarative** (fragment JSON des cours).
- Le profil devra savoir dire « une page par année » (M1 et M2 sur deux URL) et relier les deux au même parcours.
- Un parcours M1 de Mon Master correspond à une page M1 ; la page M2 du même parcours peut avoir un autre titre (ACPCI M1 → deux M2 « Administration culturelle » et « Projets culturels internationaux »).
- Les champs d'admission (attendus, critères, modalités d'examen, langues, diplômes conseillés) font partie des règles d'extraction quand une page les donne.
