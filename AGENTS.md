# AGENTS.md — notes à l'attention des agents

## Commentaires dans le code : rester simple

Les commentaires dans le code servent à **un nouveau développeur qui arrive sur le projet**.
Ils doivent expliquer l'**essentiel** : ce que fait un morceau de code et, si utile, pourquoi il existe.

Règles concrètes :

- **Pas de référence aux plans.** Ne jamais citer un fichier de `plans/` ni ses
  sections (« §X », « J1 »…J9, « problème n°1 »…). Les plans détaillent des
  étapes de travail qui évoluent et s'effacent ; le code, lui, doit se
  comprendre tout seul.
- **Pas de logique de mise en œuvre passée.** Les « on avait d'abord fait X,
  puis on a changé pour Y (retour utilisateur) », les historiques de décision
  et les numéros d'étapes n'ont pas leur place dans le code. Ils vivent dans
  les plans ou la doc.
- **Pas de technicité superflue.** Éviter le jargon interne, les explications
  d'algorithme triviales ou les détails d'implémentation qui ne servent à rien
  pour comprendre l'intention.
- **Garder ce qui aide.** Une phrase courte sur le rôle d'une classe, d'une
  fonction, d'un choix non évident (ex. « l'audio est référencé, jamais copié »)
  est la bienvenue : c'est le niveau attendu.

## Mise en forme des commentaires

- **Retour à la ligne sur ponctuation.** Chaque ligne d'un commentaire se
  termine sur une ponctuation (point, point-virgule, virgule…) ou une parenthèse fermante.
  Une coupure doit tomber sur une frontière de phrase, jamais au milieu d'un groupe de
  mots : « absent pour / un corpus normal » est à éviter au profit de
  « absent pour un corpus normal. / ». En cas de doute, reformuler pour pouvoir
  couper proprement. Si présence de tirets, il faut réfléchir à la cohérence :
  est ce que c'est une liste ? Est ce que c'est un début de phrase ? une fin de phrase et ajuster en conséquence
- **Alignement.** Les lignes de continuation des blocs `/** … */` se présentent
  comme ` *  …` (astérisque suivi de deux espaces), uniformément dans le fichier.
- **Pas d'espace en fin de ligne.**

En résumé : si un commentaire ne survit pas à la suppression des plans, il ne
 doit pas être dans le code.

## Tests : ne retéléchargez JAMAIS les images Docker

Les images et volumes Nextcloud des bancs (`docker/compose-*.yml`) sont déjà en place :
`npm run nc:up` / `npm run nc-b:up` suffisent à les démarrer. Pas de `pull`, pas de
re-provisioning ; sans serveur, les bancs concernés se sautent tout seuls.
