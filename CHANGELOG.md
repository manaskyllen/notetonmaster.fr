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

- Formulaire d'avis : nouveau statut « Parti·e avant la fin », avec « Et aujourd'hui ? »
  facultatif et « Qu'est-ce qui t'a fait partir ? » facultatif. Sur la fiche : pastille « Ex »,
  « Parti·e avant la fin » sans année, bloc « Pourquoi je suis parti·e » et filtre
  « Parti·es avant la fin » (s'il y a au moins un avis de ce type). Modération : statut et motif
  visibles, filtre par statut de l'auteur·rice dans « Tous les avis ».
- Le titre des avis disparaît : plus de champ dans le formulaire ni dans Mon espace, plus de
  titre en tête des avis sur la fiche, dans la modération, les mails et la messagerie. Le champ
  des points faibles s'appelle désormais « Ce que tu n'as pas aimé ».
- Fiche parcours : bouton « Partager » entre « Suivre » et « Donner mon avis ». Un panneau
  sous le bouton (une feuille du bas sur téléphone) avec deux onglets, « Le master » et
  « Inviter ma promo » : un message prêt à envoyer suivi du lien, « Copier le message »,
  « Copier le lien », WhatsApp et un QR code ; sur téléphone, « Partager… » ouvre le partage du
  système. Liens sans paramètre de suivi, rien n'est envoyé au serveur pour partager.
- Après l'envoi d'un avis : une seule phrase d'état, le nombre d'avis du master et un bouton
  « Inviter ma promo » (le partage du téléphone sur mobile), puis deux liens texte.
- Formulaire d'avis réglé sur un parcours : aperçu de lien « Donne ton avis sur {Parcours} »
  avec sa propre image (fond lime), toujours non indexé ; `robots.txt` autorise `/avis/nouveau`
  pour les aperçus.
- Images de partage (`/og/…`) : les polices n'étaient pas embarquées dans le build de
  production, chaque image répondait 500 ; corrigé.
- Case « Je parle de ma propre expérience… » et autres cases à cocher : centrées sur la
  première ligne de leur texte.

### Responsive

- Plus de défilement horizontal de 320 à 1440 px : onglet Admission de la fiche (étapes), index des
  mentions, comparateur et tableaux de l'administration (textes pour lecteurs d'écran qui
  débordaient), Mon espace › Compte, vue d'ensemble de l'administration. Les onglets de Mon
  espace ne décalent plus la page sur téléphone.
- Téléphone : champs en 16 px au moins (pas de zoom d'iOS), zones de toucher de 44 px (pied de
  page, fil d'Ariane, logo, bandeau, « Comparer »), carte du master choisi dans le formulaire.
- Tests : toutes les pages publiques à 320, 390 et 1024 px, `axe` aussi à 390 px, projets
  Playwright `mobile-iphone` et `mobile-android` (recherche, fiche, partage, avis ; modération et
  message de contact depuis un téléphone).

### Administration

- QR codes : liens courts `/q/{code}` gérés dans l'administration (Admin seulement), pour les
  supports imprimés. Chaque scan ajoute 1 au compteur du jour du lien, puis redirige (302) vers
  sa cible, sans paramètre ajouté ; la cible se change sans réimprimer. Aucune donnée sur la
  personne (ni IP, ni navigateur, ni provenance) ; robots, aperçus de liens, préchargements et
  `HEAD` ne sont pas comptés. Téléchargement en SVG (et PNG), détail des 90 derniers jours.
  Phrase ajoutée à la page Confidentialité.

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
- `20261125110000_qr_links` : tables `qr_links` et `qr_scans_daily` (ajouts seulement ; retour
  en arrière : `down.sql` du dossier, qui supprime aussi les compteurs).
- `20261125120000_drop_review_title` : suppression de la colonne `title` des avis (les titres déjà
  écrits sont perdus ; retour en arrière : `down.sql` du dossier, qui recrée la colonne vide).
