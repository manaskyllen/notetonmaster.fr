# Guides note ton master : format et blocs de données

Ces articles sont prévus pour l'éditeur d'articles de l'admin (voir la maquette « A11 · Articles »). Chaque fichier est un article en Markdown avec un en-tête YAML.

**Les chiffres ne sont pas écrits en dur.** Ils viennent de la base au moment de l'affichage, grâce à des **jetons** (pour un nombre dans une phrase) et à des **blocs** (pour un classement ou une liste). Quand Mon Master publie une nouvelle session, les articles se mettent à jour tout seuls.

## En-tête

```yaml
titre: "…"               # balise <title> et H1, 60 caractères au maximum, mot-clé principal au début
slug: "…"                # URL : /guides/{slug}
ville: "nantes"          # ville ouverte, ou "toutes" pour un article général
meta_description: "…"    # 120 à 155 caractères
mot_cle: "…"             # mot-clé principal, sert à la liste de contrôle SEO de l'admin
mots_cles_secondaires: []
chapo: "…"               # résumé affiché sous le H1, 2 phrases au maximum
liens_articles: []       # slugs d'articles liés (bloc « À lire aussi »)
theme: "guide"            # guide, selectivite, alternance, europe, methode ou calendrier (étiquette et filtre de /guides)
mots_cles_recherche: []  # facultatif : mots trouvés par la recherche de /guides, jamais affichés
statut: "brouillon"
```

Import : `pnpm articles:import` crée ou met à jour ces articles **en brouillon** (reconnus par leur slug ; un article déjà en ligne n'est jamais modifié) et vérifie les jetons, les blocs et les liens `/guides/…`. Sans `theme`, le thème se déduit du slug.

## Jetons (remplacés par un nombre)

`ville` est la ville de l'article. Tous les nombres portent sur la **dernière session Mon Master** de la base.

| Jeton | Valeur |
|---|---|
| `{{ville.nom}}` | Nom de la ville (« Nantes ») |
| `{{ville.parcours}}` | Nombre de parcours de master (M1) |
| `{{ville.etablissements}}` | Nombre d'établissements publics |
| `{{ville.mentions}}` | Nombre de mentions nationales |
| `{{ville.tres_selectifs}}`, `{{ville.selectifs}}`, `{{ville.accessibles}}` | Parcours par tranche de taux d'accès (< 10 %, 10 à 30 %, > 30 %) |
| `{{ville.pct_tres_selectifs}}`, `{{ville.pct_accessibles}}` | Les mêmes, en pourcentage du total, arrondis |
| `{{ville.alternance}}`, `{{ville.pct_alternance}}` | Parcours ouverts en alternance |
| `{{ville.distance}}` | Parcours hybrides ou à distance |
| `{{ville.avis}}` | Avis publiés dans la ville |
| `{{domaine.<code>}}` | Parcours d'un domaine : `all` (arts, lettres, langues), `shs`, `deg` (droit, économie, gestion), `sts` (sciences, technologies, santé) |
| `{{etablissement.<slug>}}` | Parcours d'un établissement |
| `{{site.parcours}}`, `{{site.villes}}` | Totaux du site |
| `{{session}}` | Année de la dernière session (« 2026 ») |

## Blocs (remplacés par un tableau ou une liste)

Un bloc tient sur une ligne : `::: nom clé=valeur clé=valeur :::`

| Bloc | Rendu |
|---|---|
| `::: classement type=plus-selectifs limite=10 min_candidatures=100 :::` | Tableau : parcours (lien vers la fiche), établissement, places, candidatures, taux d'accès. Types : `plus-selectifs`, `plus-accessibles`, `plus-demandes` (candidatures), `plus-grands` (places). |
| `::: classement type=… domaine=deg :::` | Le même, limité à un domaine. |
| `::: liste mention="Droit européen" :::` | Les parcours d'une mention (titre, établissement, taux d'accès). Accepte aussi `recherche="…"` (titre contenant le texte) et `modalite=alternance`. |
| `::: chiffres-ville :::` | Encadré : parcours, établissements, répartition par sélectivité (barre), alternance. |
| `::: domaines :::` | Répartition des parcours par domaine (barres). |
| `::: appel-avis :::` | Encadré « Tu es en master à {{ville.nom}} ? Donne ton avis. » avec lien vers `/avis/nouveau`. |
| `::: villes :::` | Liens vers les pages des villes ouvertes. |

Règles :
- les classements excluent les parcours qui ont moins de `min_candidatures` candidatures (100 par défaut) et ceux dont le taux est « non communiqué » ;
- chaque tableau rappelle sous lui sa source : « Source : Mon Master, session {{session}}, données ouvertes du ministère. Taux d'accès = propositions d'admission / candidatures. » ;
- si un bloc ne renvoie rien, il ne s'affiche pas. Il n'y a jamais de tableau vide.

## Liens internes

- Page ville : `/masters/{ville}`
- Fiche : `/parcours/{slug}` (les blocs créent les liens tout seuls)
- Formulaire d'avis : `/avis/nouveau`
- Méthodologie : `/a-propos`
- Autres guides : `/guides/{slug}`

## Les 12 articles

| Fichier | Ville | Mot-clé principal |
|---|---|---|
| `master-montpellier-guide.md` | Montpellier | master Montpellier |
| `masters-selectifs-montpellier.md` | Montpellier | master sélectif Montpellier |
| `master-strasbourg-guide.md` | Strasbourg | master Strasbourg |
| `masters-selectifs-strasbourg.md` | Strasbourg | master sélectif Strasbourg |
| `master-europeen-strasbourg.md` | Strasbourg | master droit européen Strasbourg |
| `master-nantes-guide.md` | Nantes | master Nantes |
| `masters-selectifs-nantes.md` | Nantes | master sélectif Nantes |
| `master-dijon-guide.md` | Dijon | master Dijon |
| `master-alternance-dijon.md` | Dijon | master alternance Dijon |
| `master-mulhouse-guide.md` | Mulhouse | master Mulhouse |
| `taux-acces-master.md` | toutes | taux d'accès master |
| `calendrier-mon-master.md` | toutes | calendrier Mon Master |

À relire avant publication :
- **`calendrier-mon-master.md`** contient des dates **en dur**, celles de la session 2026. Mets-les à jour dès que le ministère publie le calendrier 2027, en général en fin d'année ou en janvier.
- Les phrases qui commentent un chiffre (« un peu moins d'un tiers », « la ville la plus ouverte à l'alternance ») ont été écrites avec les données du 23 novembre 2026. Après une nouvelle session, vérifie qu'elles sont toujours vraies. L'admin peut le signaler : « chiffres changés depuis la dernière relecture ».

## Le nom de la marque

Dans le texte, écris **« note ton master »**, avec les espaces. Le rendu le remplace automatiquement par le logo en texte (« master » surligné en lime), sauf dans les titres, la meta description et les attributs. L'adresse reste `notetonmaster.fr`.
