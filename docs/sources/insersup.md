# `insersup` — insertion professionnelle des diplômé·es

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/insersup.json`. Extraits : `fixtures/live/insersup/`.

## Jeux

| Jeu                                                          | Lignes                                                                                     | Modifié le                         | Licence             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------- |
| `fr-esr-insersup`                                            | 1 036 781 (tous diplômes) ; 62 496 pour Master LMD × genre ensemble × nationalité ensemble | 29/07/2026 (`date_jeu = 2026_S1`)  | Licence Ouverte 2.0 |
| `fr-esr-insertion_professionnelle-master` (ancienne enquête) | 19 603                                                                                     | 30/10/2023 (dernière année : 2020) | Licence Ouverte 2.0 |

L'export complet d'InserSup est lourd (1 M de lignes, 110 colonnes). On l'exporte **filtré par l'API** : `where=type_diplome_long='Master LMD' and genre='ensemble' and nationalite='ensemble'` (43 Mo en CSV).

## Schéma réel (InserSup)

- Dimensions : `type_diplome`, `obtention_diplome` (`diplômé` ou `ensemble`), `genre`, `nationalite`, `regime_inscription` (`ensemble` ou `apprentissage`), `promo` (`2019` … `2024`, ou **deux années cumulées** `2023,2024`).
- Établissement : `etablissement` (UAI, ou `all` pour les lignes nationales), `uo_lib`, `id_paysage`, `id_paysage_actuel`, `uai_fresq`.
- Formation : `libelle_diplome` (mention en majuscules), `diplome` (**code SISE**, ex. `2500315`), `inf` (**= `inm` de Mon Master**, parfois plusieurs séparés par `/`), `dom`, `discipli`, `sectdis`.
- Mesures, pour chaque délai `m` ∈ {6, 12, 18, 24, 30} : `nb_sortants_m`, `nb_poursuivants_m`, `nb_sortants_en_emploi_sal_fr_m`, `tx_sortants_en_emploi_sal_fr_m`, `tx_sortants_en_emploi_stable_m`, `tx_sortants_en_emploi_non_sal_m`, `salaire_q1_m`, `salaire_q2_m`, `salaire_q3_m`, `flag_m`, `exception_m`.
- `tx_sortants_en_emploi_6/12/18` et `id` sont toujours vides.

## Secret statistique

- `flag_m = *` : « Moins de 20 sortants donc cumul de 2 promotions » → la ligne a `promo = "AAAA,AAAA"` → `isCumulated = true`.
- `flag_m = **` : « Moins de 20 sortants mais cumul de 2 promotions impossible » → pas de taux.
- Valeur non publiée : `nd` (23 102 taux à 12 mois). Aucune valeur n'est mise à 0 : `nd` et vide → `null`, affiché « n.c. ».
- Salaires à 6 mois : toujours `nd`.

## Pilotes

**Culture, patrimoine et médiation, Université Paris-Saclay** (`etablissement 0912408Y`, `inf 2000144G`, `diplome 2500315`), lignes `diplômé` × `ensemble` :

| Promo | Sortants à 12 mois | Emploi salarié 12 mois | 18 mois | Emploi stable 12 mois | Poursuivants 12 mois | Salaire Q1 / médiane / Q3 à 12 mois |
| ----- | ------------------ | ---------------------- | ------- | --------------------- | -------------------- | ----------------------------------- |
| 2023  | 39                 | 64,1 %                 | 69,23 % | 20,0 %                | 7                    | nd                                  |
| 2022  | 42                 | 61,9 %                 | 66,67 % | 30,77 %               | 8                    | 1 590 / 1 730 / 1 980 €             |
| 2021  | 35                 | 62,86 %                | 62,86 % | 18,18 %               | 5                    | 1 650 / 1 760 / 1 960 €             |

Les valeurs du seed sont confirmées. Le « 15,2 % de poursuite d'études » est calculé : 7 ÷ (39 + 7). Ce n'est pas une colonne de la source, il faudra écrire sa définition dans la page Sources et méthode.

**Nantes** : pas de ligne « Culture, patrimoine et médiation » (mention nouvelle en 2025). Les promotions 2019 à 2024 existent pour l'ancienne mention « Civilisations, cultures et sociétés » (`inf 1703164R`, `diplome 2500098`), par exemple promo 2024 : 69 sortants, 66,67 % à 12 mois.

**Reims** : aucune ligne pour `2400126N` ni pour l'ancienne mention `1801037C`.

## Ancienne enquête (`insertion_professionnelle-master`)

- Granularité **discipline** (20 disciplines, ex. « Histoire-géographie »), pas mention. Années 2010 à 2020. Situations à 18 et 30 mois.
- Pour les 3 universités pilotes, les lignes 2020 en Histoire-géographie valent `ns` (non significatif).
- La clé « établissement + mention normalisée » prévue au §5.2 est impossible. Elle ne peut servir qu'en contexte de discipline, et avant 2020. Décision : elle est livrée **désactivée**.

## Jointures

- Accréditation : `(etablissement, inf)` = `(monmaster.eta_uai, monmaster.inm)`. Clé directe, plus fiable que l'intitulé normalisé prévu au §5.2.
- Mention nationale : `diplome` = `sise.diplom`.
- Quand une mention change d'`inm` (réaccréditation), l'historique d'insertion reste attaché à l'ancien `inm` : l'accréditation nouvelle porte un lien « succède à » vers l'ancienne (`MentionAccreditation.predecessorId`), posé par une proposition validée dans l'admin, et l'historique d'insertion de l'ancienne s'affiche sur la mention actuelle.
