# AGENTS.md — notes à l'attention des agents

## Commentaires 

### Commentaires dans le code : rester simple

Les commentaires dans le code servent à **un nouveau développeur qui arrive sur le projet**.
Ils doivent expliquer l'**essentiel** : ce que fait un morceau de code et, si utile, pourquoi il existe.

Règles concrètes :

- **Pas de référence aux plans.** Ne jamais citer un fichier de `plans/` ni ses
  sections (« §X », « J1 »…J9, « problème n°1 »…). 
- **Pas de technicité superflue.** Éviter le jargon interne, les explications
  d'algorithme triviales 
- **Garder ce qui aide.** Une phrase courte sur le rôle d'une classe, d'une
  fonction, d'un choix non évident (ex. « l'audio est référencé, jamais copié »)
  est la bienvenue : c'est le niveau attendu.

### Mise en forme des commentaires

- **Retour à la ligne sur ponctuation.** Chaque ligne d'un commentaire se
  termine sur une ponctuation (point, point-virgule, virgule…) ou une parenthèse fermante.
  Une coupure doit tomber sur une frontière de phrase, jamais au milieu d'un groupe de mots : 
  « absent pour / un corpus normal » est à éviter au profit de
  « absent pour un corpus normal. / ». En cas de doute, reformuler pour pouvoir
  couper proprement. Si présence de tirets, il faut réfléchir à la cohérence :
  est ce que c'est une liste ? Est ce que c'est un début de phrase ? une fin de phrase et ajuster en conséquence
- **Alignement.** Les lignes de continuation des blocs `/** … */` se présentent
  comme ` *  …` (astérisque suivi de deux espaces), uniformément dans le fichier.
- **Pas d'espace en fin de ligne.**

En résumé : si un commentaire ne survit pas à la suppression des plans, il ne
 doit pas être dans le code.

## Interface : l’utilisateur n’est pas un technicien

Les dialogues expliquent les conséquences pour les données et les actions possibles,
pas les mécanismes internes. Employer un langage courant, un bilan court et des
boutons explicites ; garder les détails facultatifs. Les verrous, ETags, PUT,
barrières et journaux privés appartiennent à la documentation développeur ou à des
informations d’assistance repliées, pas au texte principal d’une confirmation.
Automatiser les étapes techniques qui ne demandent aucun choix utilisateur, sans
retirer les contrôles internes ni les confirmations nécessaires.

## Tests : ne retéléchargez JAMAIS les images Docker

Les images et volumes Nextcloud des bancs (`docker/compose-*.yml`) sont déjà en place :
`npm run nc:up` / `npm run nc-b:up` suffisent à les démarrer. Pas de `pull`, pas de
re-provisioning ; sans serveur, les bancs concernés se sautent tout seuls.

Dans pi, utilisez l'outil `preparer_bancs_docker` avant les tests GitLab ou Nextcloud
réels. Il vérifie d'abord si le service répond et ne démarre que les bancs nécessaires.
N'écrivez pas de boucle sur `/-/readiness` pour GitLab : ce banc y répond `404` même
lorsqu'il fonctionne. N'arrêtez pas un banc qui peut resservir pendant la session.

## Git : dépôt commun V1 et V2

- Le dépôt de référence est **GitHub** : `origin` → `https://github.com/AlxAlbr/SonalPi.git`.
  Les anciens dépôts V2 ne sont plus des destinations de travail ou de publication.
- `main` reste la V1, avec `ImportFlora`. Le développement V2 part de `baseV2`,
  anciennement `multiongletcorpus`. Les deux versions ont des historiques indépendants ;
  ne pas les fusionner ni remplacer `main` sans décision explicite.
- `test-new-design`, `max-suite-aide2` et `essai-crp-multionglet` sont des branches
  parallèles issues de `baseV2`, pas une succession d'étapes déjà intégrées.
- Avant de modifier ou publier : vérifier `git status -sb`, `git branch -vv`
  et `git remote -v`. Utiliser un push explicite : `git push origin <branche>`.
- Pour comparer avec GitHub : `git fetch origin`, puis `git log --oneline --left-right
  <branche>...origin/<branche>`. Détails : `docs/dev/outillage/git-remotes.md`.
- Le dépôt est public. Ne pas pousser de secrets, données privées ou artefacts :
  `out/`, `dist/`, `release/`, `node_modules/` et les résultats de tests restent locaux.
- La livraison stable V2 vise `2.0.0`, mais la version actuelle reste inchangée.
  Ne créer aucun tag ni release V2 dans le circuit stable V1 sans validation explicite.
