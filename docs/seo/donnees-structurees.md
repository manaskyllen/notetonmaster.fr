# Données structurées (JSON-LD) : ce qui est publié, et pourquoi

Règles vérifiées sur la documentation Google Search Central le 17/11/2026. Générées par `lib/seo/jsonld.ts`, testées par instantanés (`tests/unit/seo-jsonld.test.ts`) et contrôlées sur chaque page par `pnpm seo:check` (`lib/seo/jsonld-check.ts`).

## Retenu

| Page                       | Types                                                                    | Remarques                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toutes les pages publiques | `Organization`, `WebSite`                                                | Nom, URL, logo (`/icons/icon-512.png`), `sameAs` seulement si `SEO_SAME_AS` est rempli. Pas de note.                                                                                                                                                              |
| Pages avec fil d’Ariane    | `BreadcrumbList`                                                         | Construit par le composant `Breadcrumb` (prop `structured`) à partir des mêmes éléments que le fil visible ; `seo:check` compare les deux.                                                                                                                        |
| Fiche parcours             | `EducationalOccupationalProgram` (+ `CollegeOrUniversity` en `provider`) | `educationalCredentialAwarded: "Master"`, `timeToComplete` réel (`P2Y`, `P1Y` pour une entrée en M2), `numberOfCredits` (ECTS de la fiche, sinon 60 par an), `programPrerequisites` seulement si saisi. Pas d’`occupationalCategory` : aucune donnée ROME fiable. |
| Fiche université           | `CollegeOrUniversity`                                                    | Nom, site officiel, ville.                                                                                                                                                                                                                                        |

Fiches et universités d’établissements privés : pas de JSON-LD (pages `noindex`).

## Écarté

- **`aggregateRating` sur les fiches** : Google n’affiche les étoiles que pour une liste fermée de types (Book, Course, Event, LocalBusiness, Movie, Product, Recipe, SoftwareApplication, etc.). `EducationalOccupationalProgram` n’en fait pas partie. Présenter un master comme un `Course` pour obtenir les étoiles décrirait mal la page (un cours n’est pas un diplôme de deux ans), ce que la consigne exclut. La note reste affichée sur la page, sans balisage.
- **Jamais de note sur `Organization` ou `WebSite`** : ce serait une note de notre propre site, que Google refuse explicitement (« avis intéressés »).
- **`SearchAction`** : la zone de recherche dans les liens annexes n’est plus affichée depuis le 21/11/2024.
- **`FAQPage`** pour les questions de l’À propos ou des fiches : les résultats enrichis FAQ ne sont plus affichés depuis mai 2026 (déjà réservés aux sites gouvernementaux et de santé depuis 2023).
- **`Course` / Course info** : fonctionnalité retirée par Google en juin 2025.

## Validation

Validateur schema.org, sur les blocs JSON-LD de chaque type de page du build local (17/11/2026, résultat brut dans `data/schemaorg-validator.json`) : **0 erreur, 0 avertissement** sur l’accueil, une mention, une université, une page ville, une page ville × mention, une fiche avec avis et une fiche sans avis.

Commande (envoie seulement le JSON-LD de la page, qui est public) :

```sh
curl -s http://localhost:3002/parcours/valorisation-des-nouveaux-patrimoines \
  | grep -o '<script type="application/ld+json">[^<]*</script>' > /tmp/jsonld.html
curl -s https://validator.schema.org/validate --data-urlencode "html@/tmp/jsonld.html" \
  | tail -c +5 | jq '{numObjects, totalNumErrors, totalNumWarnings}'
```

Test des résultats enrichis de Google : pas d’API, et il ne peut pas lire un build local. **À faire le jour de la mise en ligne** (`mise-en-ligne.md`, étape 5) sur une page de chaque type ; seul le fil d’Ariane peut y apparaître comme résultat enrichi (les autres types sont valides mais sans affichage enrichi chez Google).

## Sources

- [Review snippet (types éligibles, avis intéressés)](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)
- [FAQ : fonctionnalité arrêtée (mai 2026)](https://developers.google.com/search/docs/appearance/structured-data/faqpage)
- [Fin de la zone de recherche des liens annexes (octobre 2024)](https://developers.google.com/search/blog/2024/10/sitelinks-search-box)
- [Simplification des résultats, juin 2025 (Course info retiré)](https://developers.google.com/search/blog/2025/06/simplifying-search-results)
- [Galerie des données structurées prises en charge](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)
- [Pagination : une canonique par page, rel=prev/next ignorés](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
