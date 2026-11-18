# `monmaster-fiches` — fiches détaillées du site candidat Mon Master

Reconnaissance du 13/11/2026. Extrait : `fixtures/live/monmaster-fiches/robots.txt`.

## Constat

`https://www.monmaster.gouv.fr/robots.txt` redirige (301) vers `https://monmaster.gouv.fr/`. Le fichier à lire est donc celui de l'hôte final, `https://monmaster.gouv.fr/robots.txt` :

```
User-agent: *
Allow: /$
Allow: /favicon.ico
Allow: /favicon.png
Allow: /apple-touch-icon.png
Disallow: /
```

Tout est interdit sauf la page d'accueil et les icônes. La page d'accueil porte en plus `<meta name="robots" content="index,nofollow">`. Le connecteur reste en `SKIP` ; seule la vérification hebdomadaire du `robots.txt` tourne, avec une alerte si son empreinte change.

## Piège

Le client doit lire le `robots.txt` de **l'hôte final après redirection**. Sinon il lit la page d'accueil HTML (renvoyée en 200 après la redirection de `www`) et ne trouve aucune règle, ce qui reviendrait à tout autoriser.

## API interne du site candidat : interdite

Le site candidat appelle une API interne (`monmaster.gouv.fr/api/candidat/…`). Elle n'est **pas** une source autorisée : non documentée et couverte par le `Disallow: /`. Elle n'est utilisée nulle part : ni dans les connecteurs, ni dans les tests, ni dans les scripts de reconnaissance.

Les attendus, critères, modalités d'examen, langues et diplômes conseillés se saisissent à la main dans l'admin (section « Admission » de la fiche, source « Saisie manuelle » avec l'URL consultée, champs verrouillés par défaut), ou viennent des sites des universités quand ils y figurent. Le jour où le jeu ouvert `fr-esr-mon_master` publierait de nouvelles colonnes (des attendus, par exemple), le contrôle hebdomadaire de `monmaster-opendata` lève une alerte d'information pour qu'on les branche.
