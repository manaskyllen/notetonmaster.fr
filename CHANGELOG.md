# Journal des versions

Une entrée par mise en production (docs/deploiement.md, étape 7) : ce qui change pour les personnes
qui utilisent le site, les migrations appliquées, la restauration testée le cas échéant.

## Non publié

### Accueil

- Nouvelle page d'accueil : recherche guidée « Quoi ? / Où ? » avec suggestions (disciplines,
  masters, établissements, villes), filtres rapides et compteur, menant à l'Explorer ; derniers
  avis à partir de 3 avis publiés ; domaines et villes. Lien « Villes » dans l'en-tête.
- Domaines : les mentions de sciences humaines et sociales et de MEEF n'avaient pas de domaine
  (disciplines « S.H.S. » et « M.E.E.F. » non reconnues) ; corrigé, et signalé dans « À traiter »
  de l'administration si cela se reproduit.

### Avis

- Formulaire d'avis : nouveau statut « J'ai arrêté en cours », avec « Et aujourd'hui ? »
  facultatif et « Qu'est-ce qui t'a fait partir ? » facultatif. Sur la fiche : pastille « Ex »,
  « A quitté le master en cours » sans année, bloc « Pourquoi je suis parti·e » et filtre
  « Parti·es en cours » (s'il y a au moins un avis de ce type). Modération : statut et motif
  visibles, filtre par statut de l'auteur·rice dans « Tous les avis ».
- « Ton master en une phrase » : titre de l'avis écrit par l'étudiant·e, obligatoire pour les
  nouveaux avis (5 à 80 caractères, sans lien), affiché entre « » en tête de l'avis ; modifiable
  depuis Mon espace. Les avis existants sans titre ne changent pas. Le champ des points faibles
  s'appelle désormais « Ce que tu n'as pas aimé ».
- Fiche parcours : bouton « Partager » (fiche, ou formulaire d'avis déjà réglé sur le parcours
  pour inviter sa promo), partage natif sur téléphone, « Copier le lien » sur ordinateur ; liens
  sans paramètre de suivi. Aperçu de lien (titre et image du parcours) pour le formulaire d'avis,
  qui reste non indexé ; `robots.txt` autorise `/avis/nouveau` pour les aperçus.

### Sécurité

- Anonymat renforcé au dépôt d'un avis ; un avis « avec mon espace » est rattaché après
  confirmation de l'adresse.
- Sessions gérées côté serveur, avec expiration après inactivité (30 minutes pour
  l'administration, 14 jours pour les étudiant·es) et cookies `__Host-`.
- Administration : codes de secours, confirmation du code pour les actions sensibles, alerte de
  connexion depuis un nouvel appareil, verrouillage progressif.
- Dates publiques arrondies au mois ; masquage des coordonnées étendu et toujours actif dans la
  messagerie.
- Justificatifs : JPEG, PNG ou PDF, sans métadonnées ; durées de conservation complétées.
- Requêtes sortantes de la collecte limitées aux adresses publiques.
- Configuration vérifiée au démarrage ; rôle de base de données dédié à l'application.

### Outillage

- Intégration continue (tests, typage, sécurité, accessibilité, SEO), tâches de nuit, Dependabot.
- Scripts `smoke`, `links`, `lighthouse`, `deploy:check`, `security:scan`.

### Migrations

- `20261121090000_auth_sessions` : sessions, codes de secours, appareils connus (ajouts seulement).
- `20261121091000_app_role_functions` : fonction de rafraîchissement de la recherche pour le rôle
  applicatif (ajout seulement).
- `20261124090000_mention_domains` : domaine des mentions qui n'en avaient pas, d'après les
  disciplines de leurs parcours (données seulement, aucun domaine existant modifié).
- `20261125090000_review_level_left` : statut `LEFT` et colonne facultative `leaveReason` des avis
  (ajouts seulement ; retour en arrière : `down.sql` du dossier, refusé tant qu'un avis utilise ce
  statut).
- `20261125100000_review_title_length` : titre des avis limité à 80 caractères (`VARCHAR(80)`,
  échoue plutôt que de couper ; retour en arrière : `down.sql` du dossier).
