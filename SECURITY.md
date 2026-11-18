# Sécurité

## Signaler une vulnérabilité

Merci de ne **pas** ouvrir de ticket public pour une faille de sécurité.

Deux moyens, au choix :

- le signalement privé de GitHub : onglet **Security** › **Report a vulnerability** ;
- un mail à **securite@notetonmaster.fr**.

Merci d'indiquer :

- la version ou le commit concerné ;
- les étapes pour reproduire ;
- l'impact estimé (données exposées, élévation de droits…).

Délais :

- accusé de réception sous **3 jours ouvrés** ;
- premier diagnostic sous **10 jours** ;
- correctif des failles graves (identité d'un·e auteur·rice d'avis, données personnelles, prise de
  contrôle d'un compte) en priorité, puis avis de sécurité publié. Tu y es crédité·e si tu le
  souhaites.

Merci de ne pas accéder aux données d'autres personnes au-delà de ce qui est nécessaire pour
montrer la faille, et de ne pas tester la disponibilité du site (pas de déni de service, pas de
collecte en masse). Utilise de préférence une instance locale avec les données de démonstration
(README).

## Périmètre

Sont concernés le code de ce dépôt et sa configuration par défaut :

- le site ;
- l'administration ;
- le worker ;
- les images Docker de production.

Ne sont pas des vulnérabilités :

- **les identifiants de démonstration du README et de `prisma/fixtures/demo.json`**. Ils sont
  publics par construction et ne servent qu'en développement. Le seed refuse de tourner en
  production sur une adresse non locale.
- **les secrets d'exemple de `.env.example`**. L'application refuse de démarrer avec eux sur une
  adresse HTTPS.

## Bonnes pratiques pour une instance

- Génère des secrets propres (`SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`). Ne les
  versionne jamais : `.env` est ignoré par git.
- N'expose ni Postgres ni Mailpit sur internet. La stack de dev les lie à 127.0.0.1.
- Garde les volumes `uploads` et `rawdata` privés : les justificatifs et les instantanés bruts ne
  sont jamais servis par le site.
