# `sise-diplomes` — diplômes préparés dans les établissements publics

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/sise-diplomes.json`. Extraits : `fixtures/live/sise-diplomes/`.

## Jeu

- `fr-esr-principaux-diplomes-et-formations-prepares-etablissements-publics`, 531 062 lignes (2006-07 à 2024-25), modifié le 07/11/2025, Licence Ouverte 2.0.
- Export filtré par l'API : `where=typ_diplome_lib like 'Master%' and annee_universitaire='2024-25'` → 7 008 lignes (Master LMD 6 374, Master enseignement 500, diplômes conférant le grade de master 128…).
- Un autre jeu existe, `fr_esr_sise_diplomes_delivres_esr_public` (652 657 lignes, diplômes **délivrés**) : non retenu.

## Schéma réel utile

`annee_universitaire`, `etablissement_id_uai`, `etablissement_id_paysage`, `etablissement_lib`, `etablissement_compos_lib`, `etablissement_compos_id_paysage`, `diplom` (**code SISE de la mention**, national), `diplome` (type : `MAS_M_MAS_AUT`…), `typ_diplome_lib`, `libelle_intitule_1` (intitulé de la mention, accentué en partie), `libelle_intitule_2`, `niveau_lib` (« 1ère année », « 2ème année »), `implantation_code_commune`, `implantation_commune`, `effectif`, `femmes`, `hommes`.

## Pilotes (2024-25)

| Université   | `diplom` | Intitulé                                                  | Niveau | Commune    | Inscrit·es |
| ------------ | -------- | --------------------------------------------------------- | ------ | ---------- | ---------- |
| Paris-Saclay | 2500315  | Culture, patrimoine et mediation                          | M1     | Guyancourt | 22         |
| Paris-Saclay | 2500315  | idem                                                      | M1     | Versailles | 17         |
| Paris-Saclay | 2500315  | idem                                                      | M2     | Guyancourt | 28         |
| Paris-Saclay | 2500315  | idem                                                      | M2     | Versailles | 22         |
| URCA         | 2500315  | idem                                                      | M1     | Troyes     | 16         |
| URCA         | 2500315  | idem                                                      | M2     | Troyes     | 12         |
| Nantes       | —        | (pas encore de ligne pour la nouvelle mention en 2024-25) |        |            |            |

## Pièges

- **`etablissement_compos_lib` n'est pas une composante pédagogique** (UFR) : c'est l'établissement-composante au sens Paysage (« Université Paris-Saclay ») ou c'est vide (URCA). SISE ne permet donc pas de trancher le conflit de composante de Valorisation des nouveaux patrimoines. Décision : SISE sort de la priorité « Composante » ; la composante vient des sites des universités, avec le libellé du lieu de Mon Master en appoint.
- Pas de niveau parcours : SISE s'arrête à la mention × établissement × commune × année d'études.
- `libelle_intitule_1` perd parfois ses accents (« mediation »).
- Les données ont un an de retard sur Mon Master : la mention nantaise de 2025 n'y est pas encore.

## Jointures

- Mention nationale : `diplom` = `insersup.diplome`. C'est la **seule clé nationale stable de la mention** dans les données ouvertes. Proposition : l'ajouter comme `Identifier.kind = SISE` sur `Mention`.
- Accréditation : `etablissement_id_uai` + `diplom`.
- Ville : `implantation_code_commune` (INSEE) confirme les communes des campus de Mon Master.

## Établissements-composantes

Les colonnes `etablissement_compos_id_paysage`, `etablissement_compos_lib` et `etablissement_id_uai_source` désignent l'établissement-composante (au sens des EPE) qui porte la ligne. Elles donnent 57 couples parent → composante (Nantes Université → Centrale Nantes, Paris-Saclay → AgroParisTech…), repris comme candidats « forts » dans `fixtures/live/esr-etablissements/etablissements-composantes-candidats.json`. L'UVSQ et l'Université d'Évry n'y figurent pas en 2024-25 : elles viennent des partenaires RNCP (candidats « faibles »).
