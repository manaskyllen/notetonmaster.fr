# `m2-selectifs` — masters à entrée sélective en M2

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/m2-selectifs.json`. Extraits : `fixtures/live/m2-selectifs/`.

## Jeu

- `fr-esr-liste_masters_2_selectifs`, 3 500 lignes, **modifié le 10/07/2019**, Licence Ouverte 2.0 (la licence est confirmée par les métadonnées du jeu).
- Colonnes : `annee_universitaire` (2016-2017 à 2019-2020), `uai`, `libelle_d_etablissement`, `master` (intitulé de **mention**), `source` (décret), `id_paysage`.

## Constats

- Le jeu est **figé depuis 2019** et liste les mentions dont l'admission en M2 pouvait être sélective sous le régime transitoire de 2016-2020. Il ne décrit pas l'offre actuelle.
- Il est au niveau **mention**, pas parcours. Il ne permet donc pas de poser `entryLevel = M2` sur un parcours.
- Il garde d'anciens UAI (Université de Nantes `0440984F`).
- Pour les pilotes : Nantes « Civilisations, Cultures, Sociétés », « Médiation, expertise et valorisation culturelles », « Histoire, civilisations, patrimoine » ; URCA « Lettres, langues et cultures étrangères ». **Les parcours M2 de Paris-Saclay (Administration culturelle, Projets culturels internationaux) n'y sont pas.** Ils sont en revanche publiés sur le site de l'université (`/m2-administration-culturelle`, `/m2-projets-culturels-internationaux`).

## Décision

Livré **désactivé**. Les parcours qui commencent en M2 viennent des sites des universités (`univ-sites`), qui publient des pages M2 distinctes (au moins à Paris-Saclay).
