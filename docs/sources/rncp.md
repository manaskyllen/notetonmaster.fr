# `rncp` — Répertoire national des certifications professionnelles

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/rncp.json`. Extraits : `fixtures/live/rncp/` (CSV des 2 fiches pilotes et `fiches_pilotes_v4_1.xml`).

## Accès

- Jeu data.gouv.fr `repertoire-national-des-certifications-professionnelles-et-repertoire-specifique` (id `5eebbc067a14b6fecc9c9976`), France compétences, Licence Ouverte 2.0, fréquence déclarée `daily`.
- **8 727 ressources** : cinq archives par jour s'accumulent depuis 2020. On liste avec `GET /api/2/datasets/5eebbc067a14b6fecc9c9976/resources/?page=1&page_size=10` (les plus récentes d'abord) et on choisit par motif de titre :
  - `export-fiches-csv-AAAA-MM-JJ.zip` (9,8 Mo, 10 CSV, 64 Mo décompressés) ;
  - `export-fiches-rncp-v4-1-AAAA-MM-JJ.zip` (75 Mo, un XML de **478 Mo**) ;
  - `export-fiches-rncp-v3-0-…`, `export-fiches-rs-…` : non utilisés.
- XSD : ressource `rncp-rs-france-competence-v4.1.xsd` (type `main`). Dictionnaire : `dictionnaire-donnees-rncp-rs-france-competences-v3.1.pdf` (le plus récent publié ; il n'existe pas de dictionnaire v4.1).
- On ne code jamais l'URL d'une ressource en dur : on garde l'identifiant du jeu et le motif de titre.

## Schéma réel

**CSV** (séparateur `;`, guillemets, CRLF) : `Standard` (`Id_Fiche`, `Numero_Fiche`, `Intitule`, `Abrege_Libelle`, `Nomenclature_Europe_Niveau`, `Date_Decision`, `Date_Fin_Enregistrement`, `Date_Effet`, `Type_Enregistrement`, `Actif`…), `Ancienne_Nouvelle_Certification`, `Blocs_De_Compétences`, `Certificateurs`, `Partenaires`, `Rome`, `Formacode`, `Nsf`, `CCN`, `VoixdAccès`.

**XML v4.1** : racine `FICHES`, une `FICHE` par certification (25 830 fiches, dont 9 366 de niveau 7 et 4 655 masters). Éléments utiles : `NUMERO_FICHE`, `INTITULE`, `ABREGE/CODE` (`MASTER`), `NOMENCLATURE_EUROPE/NIVEAU` (`NIV7`), `ACTIF` (`Oui`/`Non`), `ETAT_FICHE`, `DATE_EFFET`, `DATE_FIN_ENREGISTREMENT`, `DATE_LIMITE_DELIVRANCE` (présent dans 5 916 fiches), `ANCIENNES_CERTIFICATIONS`, `NOUVELLES_CERTIFICATIONS`, `CERTIFICATEURS`, `PARTENAIRES`, `BLOCS_COMPETENCES`, `CODES_ROME`, `TYPE_EMPLOI_ACCESSIBLES`, `ACTIVITES_VISEES`, `CAPACITES_ATTESTEES`.

Le XML contient en plus des CSV : les métiers (`TYPE_EMPLOI_ACCESSIBLES`, texte libre), les activités, `DATE_LIMITE_DELIVRANCE` et l'état de chaque certificateur. Une lecture en flux (`iterparse`) du XML complet prend environ 6 s et peu de mémoire. **Proposition** : lire le XML en flux depuis le zip, sans l'extraire sur disque (478 Mo dépassent la limite de 200 Mo prévue pour une archive décompressée). Les CSV ne servent alors que de contrôle.

## Profil

- 4 655 fiches « Master » : **305 actives**, 4 350 inactives. 542 intitulés finissent par « (fiche nationale) ».
- 2 intitulés actifs sont en double (« Sciences et numérique pour la santé », « Éco-épidémiologie »).
- Sur les 315 mentions de la session Mon Master 2025, **263 trouvent une fiche active au même intitulé normalisé** (accents, casse et « (fiche nationale) » retirés). Les 52 autres ont un intitulé un peu différent (« Comptabilité - contrôle - audit » contre « Comptabilité, contrôle, audit »…) ou n'ont pas de fiche active : similarité trigramme, puis proposition.

## Pilotes

| Fiche     | Intitulé                                           | État     | Effet      | Fin        | Remplacement            |
| --------- | -------------------------------------------------- | -------- | ---------- | ---------- | ----------------------- |
| RNCP42684 | Culture, patrimoine et médiation (fiche nationale) | ACTIVE   | 06/06/2026 | 05/06/2031 | remplace RNCP35804      |
| RNCP35804 | idem                                               | INACTIVE | 16/07/2021 | 15/07/2026 | remplacée par RNCP42684 |

- Certificateurs : ministère, Nantes Université, URCA, Université Paris-Saclay. Partenaires : UVSQ (`HABILITATION_ORGA_FORM`), AGEFASUP et Union Université Économie (`HABILITATION_FORMER`).
- 7 blocs (`RNCP42684BC01` à `BC07`), ROME E1106, K1601, K1602, L1302 (la 35804 avait aussi G1202).
- `TYPE_EMPLOI_ACCESSIBLES` : une liste en texte libre (17 métiers, puis « Après 3 à 5 années d'expérience… »). Le seed en donnait une version reformulée.
- `DATE_LIMITE_DELIVRANCE` : 15/07/2029 pour RNCP35804 (la date du seed est confirmée) et 05/06/2034 pour RNCP42684. Le jalon 1 l'avait déclarée absente à tort (sortie de recherche tronquée), corrigé au jalon 5.

## Pièges

- Le SIRET des certificateurs et partenaires commence par une **tabulation** dans les CSV (`"\t11004401300040"`).
- Apostrophes doublées dans certains CSV (`Gestion de l''information`), mais pas dans le XML.
- Une ligne vide après l'en-tête dans plusieurs CSV ; des fins de ligne CRLF et LF mélangées dans `Standard`.
- Dates au format `JJ/MM/AAAA`.
- Libellés de blocs avec espace final.
- `TYPE_EMPLOI_ACCESSIBLES` sépare les métiers par deux espaces ou plus, sans balise : le découpage est fragile, il faut le garder comme liste proposée et non comme vérité.

## Jointures

- Pas de lien direct avec Mon Master, InserSup ou SISE (ni `inm`, ni code SISE). Jointure par intitulé normalisé de la mention (sans « (fiche nationale) »), niveau `NIV7`, `ABREGE/CODE = MASTER`, état actif.
- Les certificateurs (SIRET) peuvent confirmer la liste des universités d'une mention : SIRET → établissement (le SIRET est dans `esr-etablissements.siret`).
- L'Onisep donne le code RNCP de chaque formation (`code RNCP` = 42684) : un recoupement possible si la source est activée.

## Connecteur (jalon 5)

- La ressource est cherchée à chaque passage dans la liste des ressources du jeu (`/api/2/datasets/5eebbc067a14b6fecc9c9976/resources/`, autorisée par le `robots.txt`) par son titre `export-fiches-rncp-v4-1-AAAA-MM-JJ.zip` ; aucun identifiant de ressource n'est codé en dur. Le fichier lui-même passe par l'exception données ouvertes du 14/11/2026 (`/resources` est interdit par le `robots.txt` de data.gouv.fr) : téléchargé seulement si un nouvel export est publié, au plus une fois par semaine.
- Lecture en flux de l'entrée XML du zip (`yauzl` + parseur SAX `saxes`), sans extraction : 25 830 fiches en une vingtaine de secondes. À la place d'une validation XSD complète (pas de libxml dans l'image), chaque fiche est contrôlée sur ses éléments obligatoires (`NUMERO_FICHE`, `INTITULE`, `ACTIF`, `NOMENCLATURE_EUROPE`) ; plus de 1 % de fiches incomplètes fait échouer le passage avant toute écriture.
- Toutes les fiches master de niveau 7 (actives et inactives, 4 651 le 13/11/2026) sont reflétées dans la table `Certification`. La fiche active la plus récente d'un intitulé est reliée à la mention de même intitulé normalisé (exact, puis similarité ≥ 0,92 ; proposition à valider entre 0,75 et 0,92). La mention prend le nom RNCP (priorité RNCP > Mon Master, sauf champ verrouillé), son numéro (`RNCP`) et les numéros des fiches remplacées (`RNCP_PREVIOUS`) ; son slug ne change jamais.
- Les mentions créées par Mon Master sont nommées d'après le RNCP dès la simulation (`lib/connectors/monmaster-opendata/mention-names.ts`), à partir de la table `Certification` ou, à défaut, du staging de la dernière simulation RNCP : il n'est pas nécessaire d'appliquer le RNCP avant Mon Master pour que les noms et les slugs des mentions soient définitifs.
