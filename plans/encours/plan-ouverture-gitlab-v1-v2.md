# Plan ciblé — ouvrir un projet GitLab V1 ou V2

**Implémenté sur `essai-crp-multionglet`.** Les mêmes entrées ouvrent désormais
les V2 et proposent le passage des V1 ; la reprise est disponible dans le volet
GitLab d'ouverture distante et la rubrique dédiée de l'Accueil est retirée.

### Validation ciblée

- Typecheck et build : réussis.
- 105 tests unitaires ciblés : réussis (détection, ouvertures, migration renderer et Accueil).
- 8 E2E ciblés simulés/navigation : réussis (OAuth/jeton, source connue ou nouvelle,
  choix de CRP, annulation, garde partagée, reprise et navigation V2 locale inchangée).
- 1 recette GitLab réelle : réussie sur le banc local existant. Projet V1 vers dépôt
  vide avec LFS, documents `Autres/`, ouverture V2, puis audio/vidéo sur profil neuf.
  Le commit source est inchangé ; le dépôt V2 natif s'ouvre aussi normalement.
- Aucun test sauté dans ces sélections ; pas de suite générale, de banc Nextcloud,
  de pull ou de reprovisionnement. Certificat du banc chargé, vérification TLS active.
- Un premier essai réel a rencontré l'aiguillage de première ouverture sur le profil
  neuf : le helper suit désormais ce choix utilisateur et la recette repasse.

## Objectif et limites

Une seule entrée : **« Ouvrir un corpus distant → GitLab »**.
Un V2 s'ouvre normalement ; un V1 propose sa migration vers un autre dépôt.
La rubrique de migration en bas de l'Accueil disparaît une fois la reprise accessible ailleurs.

Réutiliser le moteur GitLab existant : conversion, copies de médias et documents
`Autres/`, vérifications, publication et reprise. Ne pas modifier ce protocole,
ajouter de registre, de file d'ouvertures ou de création automatique de projet GitLab.
L'utilisateur indique l'adresse d'un autre dépôt existant, vide ou limité aux
fichiers techniques déjà admis. La source GitLab reste intacte, CRP compris.

## 1. Reconnaître avant d'ouvrir

- [x] Ajouter une préparation de lecture commune aux projets saisis et aux destinations
  enregistrées, avant installation du miroir, reprise d'opérations ou fermeture du corpus courant.
- [x] Identifier le contenu, pas seulement l'extension : résultat typé **V2 à ouvrir**,
  **V1 à migrer**, ou refus explicite. Les erreurs réseau et d'accès restent des erreurs,
  jamais des indices permettant de conclure « V1 ».
- [x] Donner priorité au natif `corpus.crp` V2 valide. Un contenu portant des marqueurs V2
  mais invalide, ambigu ou de version inconnue ne déclenche pas un repli silencieux vers une V1.
  Reconnaître aussi un V1 dont le fichier s'appelle `corpus.crp`.
- [x] Si aucun natif V2 n'est reconnu, découvrir les CRP V1 dans le périmètre du projet
  et de sa racine. Un seul candidat est préselectionné ; plusieurs demandent un choix.
  Un dépôt sans corpus ou un V2 sous un nom incorrect reçoit une explication.
- [x] Figer l'état source utilisé par la préparation et la migration avec les services
  existants ; ne pas mélanger des lectures provenant d'états différents du dépôt.

## 2. Enchaîner vers la migration préremplie

- [x] Faire remonter la distinction V1/V2 par le contrat GitLab et le pont typé,
  au lieu de traiter une V1 comme une ouverture V2 échouée.
- [x] Pour une V1, remplacer la fenêtre de connexion par la fenêtre de passage à
  SonalPi2, en conservant projet, compte, branche, racine et source préparée.
  Ne redemander ni l'adresse source ni les accès encore utilisables.
- [x] Demander le nouveau dépôt et conserver les choix média existants, dont la base
  externe optionnelle. Expliquer simplement que la source ne sera pas modifiée.
  Automatiser les lectures déjà faites et éviter les confirmations redondantes.
- [x] Conserver une seule garde pendant cet enchaînement : pas de modales concurrentes,
  de double acquisition de la garde ni de demande rejouée ensuite.
- [x] Annuler conserve le corpus courant et abandonne la préparation non publiée.
  Fermer/publier l'ancien contexte seulement lors de l'ouverture finale du V2 valide.
  Ne pas ajouter une V1 aux récents comme si elle était un V2 installé.

## 3. Garder la reprise, puis retirer la carte

- [x] Ajouter dans la fenêtre **« Ouvrir un corpus distant »**, côté GitLab, un accès
  discret **« Reprendre un passage à SonalPi2… »**, visible lorsque des suivis existent.
- [x] Réutiliser les suivis de ce poste et les commandes actuelles de vérification/reprise.
  Conserver aussi **« Ouvrir le corpus »** lorsque la publication est terminée mais
  que l'ouverture reste à réaliser. Ne pas relancer automatiquement les copies acquises.
- [x] Permettre cette reprise sans devoir rouvrir la source V1 ni repartir d'un nouveau bilan.
- [x] Retirer alors la carte GitLab et toute la rubrique de migration de l'Accueil.
  Supprimer seulement leurs branchements devenus inutiles, pas le moteur de reprise.
- [x] Mettre à jour les guides d'ouverture et de migration.

## 4. Validation limitée aux parcours utiles

- [x] Tests ciblés de détection sur dépôt mémoire : V2, V1, plusieurs CRP,
  dépôt sans corpus, contenu invalide et erreur d'accès ; aucun envoi pendant la détection.
- [x] E2E d'ouverture V1 : source et compte préremplis, choix du nouveau dépôt,
  annulation sans bascule ni écriture distante ; autre ouverture refusée pendant l'opération.
- [x] E2E V2 : ouverture normale, récents et navigation par espaces inchangés.
- [x] E2E de reprise par la nouvelle entrée, y compris une migration publiée mais non ouverte.
- [x] Une recette réelle ciblée : V1 → nouveau dépôt → V2 ouverte, source inchangée.
  Réutiliser le banc GitLab ; appeler `preparer_bancs_docker` avant ce test.
  N'ajouter Nextcloud que si le scénario exerce effectivement la base média externe.
- [x] Typecheck et build. Pas de suite générale ; rapporter séparément tests réussis,
  échecs et sauts. Aucun pull Docker, reprovisionnement ou corpus personnel utilisé.

## Principaux points d'intervention

- Main : `src/main/gitlab/ouverture.ts`, `preparationProjet.ts`, préparation de migration et handlers GitLab.
- Contrats : `src/shared/gitlab.ts`, types de migration et `src/preload/index.ts`.
- Renderer : `useCycleCorpus.ts`, `CorpusDistant.vue`, `MigrationGitLab.vue`,
  `useMigrationGitLab.ts`, `useSourceMigrationGitLab.ts` et branchements dans `App.vue`/`Accueil.vue`.

**Terminé quand :** ouvrir un projet suffit pour les deux versions, une préparation
annulée laisse le travail courant intact, les reprises restent accessibles sans
carte dédiée et aucune modification du dépôt source n'est effectuée.
