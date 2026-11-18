# Animations

Toutes les règles de mouvement du site sont dans [`styles/motion.css`](../styles/motion.css). Les
composants n'écrivent pas de CSS de mouvement : ils posent une classe (`nm-…` pour les briques
génériques, un préfixe par bloc pour les autres : `ix-` index, `cp-` sélecteur de ville, `ft-` pied
de page, `qp-` questions…).

Toutes les animations sont visibles en direct sur la vitrine des composants,
[`/design-system`](http://localhost:3000/design-system) (en développement seulement).

## Principes

- **Jetons de durée et de courbe** : `--dur-fast` 120 ms, `--dur` 180 ms, `--dur-slow` 260 ms,
  `--ease`, `--ease-out`. Un bloc qui a besoin d'une durée propre la garde, mais elle reste courte.
- **Seulement `transform` et `opacity`**, plus `box-shadow` et les couleurs au survol. Deux
  exceptions assumées : la largeur des points du formulaire d'avis et la hauteur des blocs
  repliables (`grid-template-rows: 0fr → 1fr`).
- **Rien au chargement qui bloque la lecture** : les entrées en cascade utilisent
  `animation-fill-mode: backwards`, le rendu serveur montre l'état final.
- **Les « célébrations »** (« Suivre », « Utile ») ne jouent qu'après le clic de la personne
  (`data-celebrate`), jamais au chargement ni à l'annulation.
- **Thème** : les couleurs passent par les variables de `styles/tokens.css`, les animations
  marchent à l'identique en clair et en sombre.

## Mouvement réduit

Avec `prefers-reduced-motion: reduce`, tout mouvement est coupé ou ramené à un fondu :

- une règle globale en fin de `motion.css` (et dans `app/globals.css`) ramène les durées à 0,01 ms ;
- chaque bloc a en plus son propre `@media (prefers-reduced-motion: reduce)` qui retire
  translations, rotations et mises à l'échelle.

Vérifié par `tests/e2e/11-reduced-motion.spec.ts` : après avoir déclenché les animations de
`/design-system`, de l'accueil, d'une fiche et du formulaire d'avis, aucune animation ni transition
ne déplace, ne met à l'échelle ni ne fait tourner quoi que ce soit.

## Carte des blocs

| Bloc                                                    | Section de `motion.css`                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Changement de thème, cartes cliquables, boutons, champs | « Theme change », « Clickable cards », « Buttons », « Fields »                                                                                                                             |
| Puces, onglets, interrupteurs                           | « Chips, tabs, switches » (interrupteur : le bouton glisse avec un rebond et s'étire à chaque changement)                                                                                  |
| Résultats de recherche                                  | « Search: results in cascade », « Search results fall into place »                                                                                                                         |
| Palette ⌘K et pastille de recherche de l'en-tête        | « ⌘K palette and header pill »                                                                                                                                                             |
| Formulaire d'avis                                       | « Review form stepper », « Master autocomplete », « GradePicker », « Thank-you screen »                                                                                                    |
| Fiche parcours                                          | « Note globale card », « Utile vote », « D'où viennent les admis », « Comment ce master évolue », « Droit de réponse », « Questions publiques », « Programme », « Même mention, ailleurs » |
| Suivre, comparer                                        | « Suivre / Suivi », « Comparer → Ajouté », « Compare bar »                                                                                                                                 |
| Mon espace                                              | « Mon espace », « Masters suivis »                                                                                                                                                         |
| Fenêtres, toasts, menu mobile                           | « Modals », « Toasts and confirmations », « Mobile menu »                                                                                                                                  |
| Pied de page                                            | « Footer » (chiffres qui défilent à la première apparition)                                                                                                                                |
| Bandeau d'information                                   | « Bandeau d'information »                                                                                                                                                                  |
| Accueil, index `/mentions` et `/universites`            | « la ligne des villes ouvertes », « Indexes » (`ix-card`, `ix-chip`, `cp-pop`)                                                                                                             |
| Navigation entre pages                                  | « Page navigation » (View Transitions quand le navigateur les gère)                                                                                                                        |
