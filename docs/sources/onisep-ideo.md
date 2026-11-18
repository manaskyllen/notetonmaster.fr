# `onisep-ideo` — Idéo-Formations initiales (Onisep)

Reconnaissance du 13/11/2026. Schéma : `fixtures/schemas/onisep-ideo.json`. Extraits : `fixtures/live/onisep-ideo/` (3 lignes, numéros de téléphone retirés ; extrait sous ODbL, attribution : Onisep).

## Jeux (data.gouv.fr, producteur Onisep, licence **ODbL**)

| Jeu                                                                                                 | Ressource utilisée                                                            | Taille |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| `ideo-formations-initiales-en-france` (id `68b0df7b5fc04a2f363846bb`)                               | CSV `https://data.onisep.fr/api/v1/downloads/5fa591127f501/5fa591127f501.csv` | 2,4 Mo |
| `ideo-actions-de-formation-initiale-univers-enseignement-superieur` (id `607934f531d60a476607d37b`) | CSV `…/605344579a7d7/605344579a7d7.csv`                                       | 26 Mo  |

Fréquence déclarée : `punctual`, mais les jeux ont été modifiés les 05 et 06/11/2026. L'URL de téléchargement passe par `data.onisep.fr` : on la lit dans la liste des ressources du jeu, sans la coder en dur.

## Schéma réel

- **Formations** (une ligne par diplôme national) : `libellé formation principal` (« master mention culture, patrimoine et médiation »), `code RNCP` (sans préfixe : `42684`), `URL et ID Onisep` (`…/formation/slug/FOR.6750`), `niveau de certification`, `domaine/sous-domaine`, dates.
- **Actions de formation** (une ligne par lieu) : `Action de Formation (AF) identifiant Onisep` (`AF.66439`), `FOR URL et ID Onisep`, `ENS code UAI` (**UAI de la composante**, pas de l'établissement), adresse, coordonnées, `AF page web`.

## Pilotes

- `FOR.6750` ↔ RNCP 42684 (mention, pas parcours).
- Actions : UFR de sociologie de Nantes (`0442452B`), Campus des Comtes de Champagne à Troyes (`0101037Y`), Graduate School Humanités - sciences du patrimoine de Paris-Saclay (`0912408Y`, à Saclay).
- Le lien `AF page web` de Nantes pointe vers une page d'un ancien site de composante (`lettreslangages.univ-nantes.fr`, mention « Civilisations, cultures et sociétés ») dont le certificat n'est plus valide.

## Constats

- L'identifiant Onisep est au niveau **mention** (`FOR.xxxx`). Le niveau parcours n'existe pas : l'action (`AF.xxxx`) est un lieu.
- Il y a un intérêt réel (code RNCP par mention, UAI des composantes), mais la licence ODbL impose le partage à l'identique d'une base dérivée. On confirme la décision du projet : **désactivé par défaut**, et si on l'active, on ne garde que `FOR.xxxx` et le lien.
