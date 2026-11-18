# `monmaster-opendata` — données ouvertes Mon Master

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/monmaster-opendata.json`. Extraits : `fixtures/live/monmaster-opendata/`.

## Jeux

| Jeu                      | Sessions   | Lignes                 | Modifié le | Licence             |
| ------------------------ | ---------- | ---------------------- | ---------- | ------------------- |
| `fr-esr-mon_master`      | 2024, 2025 | 16 257 (8 090 + 8 167) | 04/12/2025 | Licence Ouverte 2.0 |
| `fr-esr-mon_master_2023` | 2023       | 7 694                  | 22/03/2024 | Licence Ouverte 2.0 |

- Portail : `https://data.enseignementsup-recherche.gouv.fr/api/explore/v2.1/catalog/datasets/<id>`
- Export complet : `…/<id>/exports/csv?delimiter=%3B` (11,9 Mo et 4,6 Mo).
- **Pas de session 2026 publiée** à ce jour (13/11/2026) : la dernière publication date de décembre 2025. Le rythme observé est d'une publication par an, en fin d'année.
- La date de version à lire est `metas.default.modified` (ou `data_processed`) du jeu. **Les exports ne renvoient ni `ETag` ni `Last-Modified`** : la détection « rien de nouveau » repose sur la date du jeu, puis sur l'empreinte SHA-256.

## Schéma réel (2024-2025)

Les noms de colonnes sont **en minuscules** : `n_can_pp`, et non `N_can_pp` comme dans la méthodologie.

| Rôle                     | Colonnes                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clés                     | `session`, `ifc` (formation), `inm` (mention), `inmp` (parcours, vide dans 11,7 % des lignes), `eta_uai`, `id_paysage`, `id_paysage_actuel`                                                                                                                         |
| Libellés                 | `eta_nom`, `mention` (MAJUSCULES sans accents), `parcours`, `lieux`, `alternance` (0/1), `modalite_enseignement` (liste séparée par des virgules : `INITIALE`, `CONTINUE`, `APPRENTISSAGE`, `CONTRAT_PRO`)                                                          |
| Discipline et territoire | `disci_master`, `discipline`, `disci_lib`, `secteur_disci`, `secteur_disci_lib`, `acad*`, `lieu_acad*`, `lieu_reg_acad*`                                                                                                                                            |
| Chiffres                 | `col`, `n_can_pp`, `n_can_pc`, `n_clas_total`, `n_clas_pp`, `n_clas_pc`, `n_prop_total`, `n_prop_pp`, `n_prop_pc`, `n_accept_total`, `n_accept_pp`, `n_accept_pc`, `rang_dernier_appele_pp`, `rang_dernier_appele_pc`, `n_recrut_comp`, drapeaux `pp` et `pc` (0/1) |
| Détail par public        | `n_*_femme_*`, `n_*_lg3_*`, `n_*_lp3_*`, `n_*_but3_*`, `n_*_master_*`, `n_*_autre_*`, `n_*_noninscri_*`, `pct_accept_*` (non utilisés pour l'instant, gardés dans `raw`)                                                                                            |

Le jeu 2023 a un **schéma différent** : `lieux_formation` au lieu de `lieux`, `n_can`, `n_clas`, `n_prop`, `n_accept` sans distinction de phase, `rang_dernier` au lieu de `rang_dernier_appele_pp/pc`, ni `pp` ni `pc`. Le connecteur a donc deux lecteurs, un par schéma.

## Profil

- `(session, ifc)` est unique. 7 304 `ifc` sont présents en 2024 et en 2025, 863 sont nouveaux en 2025, 786 ont disparu.
- 350 `inm` apparaissent sous plusieurs UAI (co-accréditations).
- 214 groupes en 2025 (251 en 2024) ont **plusieurs `ifc` pour la même UAI, le même `inmp`, le même lieu et la même modalité** : c'est le cas ACPCI, et ce sera environ 214 propositions de fusion au premier import national.
- 477 `inmp` ont à la fois une formation en alternance et une en présentiel (deux `ifc`).
- `col` va de 1 à 350, jamais 0. Aucune ligne n'a plus de propositions que de candidatures.
- `rang_dernier_appele_pp` est vide dans 3,5 % des lignes, `rang_dernier_appele_pc` dans 66,7 %.
- **2 319 lignes ont `pc = 1` mais pas de `rang_dernier_appele_pc`.** Décision : on retombe alors sur le rang PP, et la provenance précise la phase utilisée.
- 2 009 des 2 253 lignes en alternance ont un `rang_dernier_appele_pp` : on ne l'affiche pas (règle de l'alternance).
- 120 UAI, 327 mentions, 6 509 `inmp`.

## Pièges

- **BOM UTF-8** en tête de fichier : la première colonne s'appelle `﻿session` si on ne le retire pas.
- `lieux` : plusieurs lieux séparés par `|` en 2025, **par `,` en 2024** (« Nantes Université - NANTES (44),Faculté des Langues… »). Chaque lieu a la forme `Libellé - COMMUNE [CEDEX n] (département)`. Il n'y a ni code postal ni code INSEE : on résout la commune par nom et département via geo.api.gouv.fr, après avoir retiré `CEDEX` et son numéro.
- Depuis 2025, beaucoup de lieux commencent par un lieu générique (« Nantes Université - NANTES (44) ») avant la vraie composante.
- `parcours` contient des codes internes : `(PR1138)` en 2025, `#PR1138` en 2023-2024, un préfixe `M1 `, des sigles entre parenthèses (`(MCCI)`, `(VNP)`, `(HE)`) qui vont et viennent d'une session à l'autre, des doubles espaces et des fautes (« bibliothéques »).
- `mention` est en majuscules sans accents : on prend l'intitulé accentué dans le RNCP ou SISE.
- **Les `ifc`, `inm` et `inmp` changent quand l'université change d'accréditation.** À Nantes, les 4 parcours pilotes étaient en 2023-2024 dans la mention « Civilisations, cultures et sociétés » (`inm 1703164R`) avec d'autres `ifc`, et passent en 2025 dans « Culture, patrimoine et médiation » (`inm 2500101K`). À Troyes, le parcours était en 2023 dans « Patrimoine et musées » (`inm 1801037C`), sous le titre « Patrimoine et médiation culturelle ». Le rapprochement entre sessions ne peut donc pas exiger la même mention.
- Le premier chiffre de `inm` semble suivre l'année d'accréditation (`17…`, `18…`, `20…`, `24…`, `25…`), sans que ce soit documenté.
- `id_paysage` peut différer de `id_paysage_actuel` (8 établissements fusionnés ou renommés) : on joint sur `id_paysage_actuel`.

## Lignes pilotes

| Parcours                              | Session | `ifc`        | `inmp`      | Lieu                                   | `col` | Cand. PP / PC | Prop. | Accept. | Rang PP   |
| ------------------------------------- | ------- | ------------ | ----------- | -------------------------------------- | ----- | ------------- | ----- | ------- | --------- |
| Valorisation des nouveaux patrimoines | 2025    | 2500101KDKQN | 2500101-02L | Nantes Université ; FLCE               | 19    | 320 / 0       | 47    | 18      | 48        |
| EPIC                                  | 2025    | 2500101KWEVZ | 2500101-07S | UFR de Sociologie                      | 18    | 428 / 0       | 38    | 19      | 61        |
| MCCI                                  | 2025    | 2500101KNGLJ | 2500101-04N | Nantes Université ; FLCE               | 28    | 256 / 0       | 61    | 33      | 61        |
| HACM                                  | 2025    | 2500101K7QD2 | 2500101-01K | Nantes Université ; UFR d'Histoire…    | 20    | 95 / 0        | 34    | 18      | 43        |
| ACPCI                                 | 2025    | 2000144GJ2FE | 2000144-03K | Guyancourt                             | 9     | 168 / 0       | 31    | 9       | 68        |
| ACPCI                                 | 2025    | 2000144GHGRB | 2000144-03K | Guyancourt                             | 9     | 252 / 0       | 39    | 9       | 74        |
| EMAS (alternance)                     | 2025    | 2000144GANLI | 2000144-04L | Versailles                             | 22    | 850 / 0       | 12    | 10      | 68 → n.c. |
| Musée, bibliothéques, archives        | 2025    | 2400126NBJPY | 2400126-01M | Campus des Comtes de Champagne, Troyes | 15    | 496 / 0       | 51    | 15      | 141       |

Historique : ACPCI `GJ2FE` 2024 = 183 / 22 / rang 39 / 11 acceptés, 2023 = 248 / 24 / 47 / 9 ; `GHGRB` 2024 = 272 / 34 / 61 / 11, 2023 = 289 / 39 / 79 / 9 ; EMAS 2024 = 20 places, 573, 17, 16 acceptés (à Guyancourt), 2023 = 20, 474, 55, 17 ; Troyes 2024 = 15 places, 443 + 40 en PC, 64, 15, rang PP 208 (`pc = 1` sans rang PC). Écarts avec le seed : `docs/ecarts-donnees.md`.

## Jointures

- Université : `eta_uai` → `esr-etablissements.uai` (ou `anciens_codes_uai`), sinon `id_paysage_actuel` → `etablissement_id_paysage`. 20 UAI sur 120 sont absents du jeu des principaux établissements (14 même par Paysage) : les écoles concernées sont créées depuis Mon Master (`eta_nom`, `id_paysage_actuel`).
- Accréditation : `inm` + `eta_uai` → `insersup.inf` + `insersup.etablissement`.
- Mention nationale : `mention` normalisée → intitulé RNCP « (fiche nationale) » ou `sise.libelle_intitule_1`. Il n'y a **pas de code SISE ni de numéro RNCP** dans Mon Master.
- Parcours : `ifc` (stable d'une session à l'autre dans 90 % des cas), puis `inmp` + UAI + lieu, puis UAI + titre normalisé + commune (sans la mention, voir les pièges).

## Premier PREVIEW national (13/11/2026, non appliqué)

Run `cmwf6w3s90000ylmw1xjdcu4u`, base de dev = seed + établissements appliqués.

|                                                                      | Nombre                         |
| -------------------------------------------------------------------- | ------------------------------ |
| Lignes lues (2023 / 2024 / 2025)                                     | 23 951 (7 694 / 8 090 / 8 167) |
| Formations de la session 2025                                        | 8 167                          |
| Universités : existantes / à créer                                   | 3 / 112                        |
| Mentions : existantes / à créer                                      | 1 / 325                        |
| Accréditations (UAI × `inm`, toutes sessions)                        | 3 460                          |
| Fiches parcours : reliées / à créer                                  | 7 / 7 739                      |
| Propositions de succession (anciens numéros)                         | 134 numéros                    |
| Propositions de fusion (même parcours, plusieurs numéros en 2025)    | 420 numéros dans 214 groupes   |
| Historique sans fiche (numéros absents de 2025, sans correspondance) | 1 131 numéros                  |
| Lignes écartées (hors bornes)                                        | 0                              |
| Parcours non reconduits                                              | 0                              |
| Champs modifiés (valeurs)                                            | 69 900                         |

Les 214 groupes de fusion ont tous des intitulés identiques, une même discipline et un même lieu (dont des masters MEEF à 16 numéros) : le jeu ouvert ne permet pas de les distinguer.

## PREVIEW national avec les noms RNCP (14/11/2026, non appliqué)

Run `cmwfa15oi0000bpmhykbu9r36` (base de dev : seed + établissements appliqués, RNCP simulé). Durée de la simulation : environ 1 min (fichiers réutilisés).

|                                     | Nombre                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Lignes lues (2023 / 2024 / 2025)    | 23 951 (7 694 / 8 090 / 8 167)                                            |
| Universités : existantes / à créer  | 3 / 108 (les anciens UAI des universités fusionnées deviennent des alias) |
| Mentions : existantes / à créer     | 1 / 325, dont 291 nommées d'après le RNCP et 34 d'après Mon Master        |
| Fiches parcours : reliées / à créer | 7 / 8 159 (les numéros à fusionner restent des fiches séparées)           |
| Fusions proposées                   | 420 numéros, dont 158 dans des groupes de 2 et 119 recommandées           |
| Successions à valider               | 139 numéros                                                               |
| Historique sans fiche               | 1 125 numéros                                                             |
| Contrôles de bornes (5 types)       | 23 951 lignes chacun, 0 en échec                                          |
| Échantillon                         | 20 parcours, 200 champs comparés à la ligne source, 200 conformes         |
| Slugs                               | identiques entre deux simulations (0 différence sur 8 166 fiches)         |

Mesure sur une copie de la base (base de banc, supprimée ensuite) : publication nationale en 57 s, plus 0,9 s pour l'index de recherche ; un second passage identique ne crée ni ne modifie rien (52 619 champs inchangés), aucun slug ne change après publication, et il rattache 29 anciens numéros dont les intitulés sont devenus identiques après la première publication.
