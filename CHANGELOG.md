# Journal des versions

Une entrée par mise en production (docs/deploiement.md, étape 7) : ce qui change pour les personnes
qui utilisent le site, les migrations appliquées, la restauration testée le cas échéant.

## Non publié

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
