# `esr-etablissements` — établissements, implantations, communes

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/esr-etablissements.json`. Extraits : `fixtures/live/esr-etablissements/`.

## Jeux

| Jeu                                                                    | Lignes | Modifié le                        | Licence              |
| ---------------------------------------------------------------------- | ------ | --------------------------------- | -------------------- |
| `fr-esr-principaux-etablissements-enseignement-superieur`              | 245    | 26/02/2025 (retraité chaque nuit) | Licence Ouverte 2.0  |
| `fr-esr-implantations_etablissements_d_enseignement_superieur_publics` | 2 561  | **25/10/2017**                    | Licence Ouverte (v1) |
| geo.api.gouv.fr `/communes`                                            | —      | —                                 | Licence Ouverte 2.0  |

`data_processed` change chaque nuit alors que `modified` ne bouge pas : la version à suivre est `modified`, puis l'empreinte.

## Schéma réel utile

**Principaux établissements** : `uai` (unique), `anciens_codes_uai` (séparés par `;`), `etablissement_id_paysage` (unique), `uo_lib`, `nom_court`, `sigle`, `type_d_etablissement` (Université 65, École 145, Grand établissement 25, Autre 10), `url`, `coordonnees` (« lat, lng »), `com_code` (INSEE), `com_nom`, `dep_*`, `aca_*`, `reg_*`, `adresse_uai`, `code_postal_uai`, `localite_acheminement_uai`, `etablissement_experimental`, `universites_fusionnees`, et une centaine de colonnes de réseaux sociaux et d'identifiants (ROR, Wikidata, SIRET…) qu'on garde dans `raw`.

**Implantations** : `etablissement_uai`, `uai` (de l'implantation), `implantation_lib`, `com_code`, `com_nom`, `coordonnees`, `effectif`, `nature_uai`, `type_uai`.

## Pilotes

| Établissement                         | UAI                                   | Paysage | Site                       | Commune du siège     |
| ------------------------------------- | ------------------------------------- | ------- | -------------------------- | -------------------- |
| Nantes Université                     | 0442953W (ancien 0440984F)            | qUCQp   | univ-nantes.fr             | Nantes 44109         |
| Université Paris-Saclay               | 0912408Y (anciens 0912330N, 0911101C) | G2qA7   | universite-paris-saclay.fr | Gif-sur-Yvette 91272 |
| Université de Reims Champagne-Ardenne | 0511296G                              | 57OsX   | univ-reims.fr              | Reims 51454          |
| UVSQ (établissement-composante)       | 0781944P                              | V13Pk   | uvsq.fr                    | Versailles 78646     |

- **Mon Master utilise l'UAI de Paris-Saclay (0912408Y) pour Guyancourt et Versailles**, pas celui de l'UVSQ. L'UVSQ n'apparaît comme établissement porteur dans aucune ligne pilote. Elle apparaît dans le RNCP comme partenaire habilité à organiser la formation.
- Le jeu **ne dit pas** que l'UVSQ est un établissement-composante de Paris-Saclay : aucune colonne « parent ». Seul `etablissement_experimental = Oui` signale Paris-Saclay et Nantes Université comme établissements expérimentaux.
- Implantations à Troyes (URCA) : antenne de l'UFR Lettres et sciences humaines (`0101062A`), antenne de l'UFR Droit (`0101037Y`, que l'Onisep utilise pour le « Campus des Comtes de Champagne »), IUT… Aucune ne s'appelle « Campus des Comtes de Champagne ».

## Pièges

- **Le jeu des implantations n'est plus mis à jour depuis 2017** : Nantes Université (créée en 2022) n'y est pas, seulement l'ancienne Université de Nantes. Il ne peut pas servir de référence pour les campus. Les campus viendront donc des `lieux` de Mon Master (libellé + commune), rattachés au code INSEE. Les implantations ne servent qu'à compléter les coordonnées quand l'UAI correspond.
- 20 des 120 UAI de Mon Master manquent dans les principaux établissements (écoles surtout : ENSTA Bretagne, TSE, EHESP, ENS Rennes, Grenoble INP, Paris 8…) ; 6 se retrouvent par l'identifiant Paysage.
- L'API Paysage (`api.paysage.enseignementsup-recherche.gouv.fr`) n'a pas répondu depuis cette machine. Elle demande en principe une clé.
- `coordonnees` est une chaîne « lat, lng » ; le centre des communes de geo.api.gouv.fr est en `[lng, lat]`.
- geo.api.gouv.fr répondait en début de session (`/communes?nom=Troyes` → 10387, Aube, Grand Est), puis présentait un certificat qui ne correspond pas au nom d'hôte. L'extrait `geo_communes.json` sera fait au jalon 3. Le client devra échouer proprement dans ce cas, sans jamais désactiver la vérification TLS.

## Jointures

- Université : `uai` ou `anciens_codes_uai` ← `monmaster.eta_uai` ; `etablissement_id_paysage` ← `monmaster.id_paysage_actuel`, `insersup.id_paysage_actuel`, `sise.etablissement_id_paysage`.
- Commune : `com_code` (INSEE) ; pour Mon Master, nom de commune + numéro de département → geo.api.gouv.fr.
- Établissement-composante : **saisie manuelle** dans l'admin (`University.parentId`, champ « Établissement parent », audité). Pas de clé Paysage.
- Campus : créés à partir des `lieux` de Mon Master, rattachés au code INSEE. Les implantations (2017) ne complètent que des coordonnées.

## Liste de départ des établissements-composantes

`fixtures/live/esr-etablissements/etablissements-composantes-candidats.json`, 62 candidats, à valider un par un dans l'admin :

- 57 « forts », lus dans SISE 2024-25 (`etablissement_compos_*` différent de l'établissement) : Nantes Université → Centrale Nantes, ENSA Nantes, Beaux-arts de Nantes Saint-Nazaire ; Paris-Saclay → AgroParisTech, CentraleSupélec, ENS Paris-Saclay, Institut d'optique ; PSL → Dauphine, ENS, Mines… ; Grenoble Alpes → Grenoble INP… ;
- 5 « faibles », déduits des partenaires RNCP (habilité à organiser des fiches master actives toutes certifiées par un même établissement, sans en être certificateur) : **UVSQ → Paris-Saclay** et **Évry → Paris-Saclay**, qui sont justes, et 3 co-accréditations qu'il faudra rejeter (Montpellier → Paul-Valéry, Toulouse INP → CNAM, Haute-Alsace → Strasbourg).
- `anciens_codes_uai` ne désigne pas une composante mais un ancien UAI du même établissement (fusion) : il devient un `Identifier` `UAI` de plus, pas un parent.
