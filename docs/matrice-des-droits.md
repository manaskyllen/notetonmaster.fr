# Matrice des droits

Chaque action serveur et chaque route vérifie elle-même la session et le rôle : une Server Action
est un point d'entrée public, que le bouton soit affiché ou non. Cette matrice est testée
automatiquement (`tests/integration/security/rights-matrix.test.ts`). Chaque action y est appelée
avec chaque rôle qui n'y a pas droit, et le refus est vérifié avant tout effet.

Les actions marquées 🔐 demandent en plus le code de double authentification de moins de
5 minutes (`guardSensitive`, dialogue « Confirme ton code »).

## Rôles

| Rôle               | Qui                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Admin              | tous les droits, dont l'équipe et les paramètres                                           |
| Modération         | avis, justificatifs, messages, signalements, questions, réponses des équipes               |
| Données            | fiches, collectes, arbitrages                                                              |
| Légal              | demandes légales, données de connexion                                                     |
| Équipe pédagogique | répond aux avis des parcours de son établissement (adresse d'un domaine officiel vérifiée) |
| Étudiant·e         | son espace, ses avis, ses conversations, ses justificatifs                                 |
| Visiteur           | lecture du site public, avis, questions et signalements avec Turnstile                     |

## Administration

| Action                                                         | Admin | Modération | Données | Légal |
| -------------------------------------------------------------- | :---: | :--------: | :-----: | :---: |
| Voir le tableau de bord, les fiches, le journal (hors Légal)   |  ✅   |     ✅     |   ✅    |  ✅   |
| Voir les entrées Légal du journal d'audit                      |  ✅   |     ❌     |   ❌    |  ✅   |
| Exporter le journal d'audit 🔐                                 |  ✅   |     ❌     |   ❌    |  ✅   |
| Exporter des fiches (CSV) 🔐                                   |  ✅   |     ✅     |   ✅    |  ✅   |
| Vues enregistrées (les siennes seulement)                      |  ✅   |     ✅     |   ✅    |  ✅   |
| Modérer avis, justificatifs, messages, questions, réponses     |  ✅   |     ✅     |   ❌    |  ❌   |
| Retirer un contenu signalé 🔐                                  |  ✅   |     ✅     |   ❌    |  ❌   |
| Télécharger un justificatif                                    |  ✅   |     ✅     |   ❌    |  ❌   |
| Actions groupées sur les avis                                  |  ✅   |     ✅     |   ❌    |  ❌   |
| Modifier une fiche, son programme, importer un livret          |  ✅   |     ❌     |   ✅    |  ❌   |
| Publier ou dépublier, secteur, actions groupées sur les fiches |  ✅   |     ❌     |   ✅    |  ❌   |
| Arbitrer un conflit, appliquer une règle de source             |  ✅   |     ❌     |   ✅    |  ❌   |
| Rapprochements (décider, fusionner)                            |  ✅   |     ❌     |   ✅    |  ❌   |
| Lancer une collecte, relancer, mettre en pause                 |  ✅   |     ❌     |   ✅    |  ❌   |
| Valider une simulation et appliquer un import                  |  ✅   |     ❌     |   ✅    |  ❌   |
| Traiter une demande légale 🔐                                  |  ✅   |     ❌     |   ❌    |  ✅   |
| Exporter les données de connexion d'une réquisition 🔐         |  ❌   |     ❌     |   ❌    |  ✅   |
| Inviter, changer de rôle, retirer un membre 🔐                 |  ✅   |     ❌     |   ❌    |  ❌   |
| Paramètres et bandeau d'information                            |  ✅   |     ❌     |   ❌    |  ❌   |
| Ouvrir ou fermer une ville 🔐                                  |  ✅   |     ❌     |   ❌    |  ❌   |
| QR codes : créer, modifier, archiver, télécharger              |  ✅   |     ❌     |   ❌    |  ❌   |

Une session admin dure 8 heures au plus et se ferme après 30 minutes d'inactivité. Un changement
de rôle ou un retrait ferme toutes les sessions du membre.

## Site public

| Action                                                         | Visiteur  | Étudiant·e | Équipe pédagogique | Admin |
| -------------------------------------------------------------- | :-------: | :--------: | :----------------: | :---: |
| Lire les fiches, avis, questions                               |    ✅     |     ✅     |         ✅         |  ✅   |
| Donner un avis (confirmé par un code reçu par mail)            |    ✅     |     ✅     |         ✅         |  ✅   |
| Poser une question publique, voter « utile »                   |    ✅     |     ✅     |         ✅         |  ✅   |
| Signaler un avis, écrire au contact                            |    ✅     |     ✅     |         ✅         |  ✅   |
| Modifier ou supprimer **son** avis                             |    ❌     |     ✅     |         ❌         |  ❌   |
| Lire et répondre dans **ses** conversations, bloquer, signaler |    ❌     |     ✅     |         ❌         |  ❌   |
| Répondre par lien à usage unique (sans compte)                 | lien reçu | lien reçu  |         ❌         |  ❌   |
| Envoyer un justificatif, vérifier une adresse universitaire    |    ❌     |     ✅     |         ❌         |  ❌   |
| Suivre un master, réglages, export RGPD, suppression du compte |    ❌     |     ✅     |         ❌         |  ❌   |
| Répondre sous un avis d'un parcours de son établissement       |    ❌     |     ❌     |         ✅         |  ❌   |
| Répondre sous un avis d'un autre établissement                 |    ❌     |     ❌     |         ❌         |  ❌   |

Accès direct par identifiant : un objet d'une autre personne n'est jamais lu ni modifié par son
identifiant (avis, conversation, message, justificatif, vue enregistrée, export, réponse d'équipe,
demande légale), selon `tests/integration/security/idor.test.ts`. Les brouillons d'avis ne vivent
que dans le navigateur.
