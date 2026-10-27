# Locuteurs dans un entretien

Le panneau Locuteurs édite les entrées de l’entretien ouvert et attribue leurs
index aux paragraphes. Les fonctions métier pures n’ont connaissance ni du DOM
ni de ProseMirror ; le composable orchestre l’éditeur et la sauvegarde.

## Ajouter et renommer

Un nouveau locuteur reçoit un `id` opaque, l’index `max + 1`, des valeurs vides
et aucun lien de personne. Renommer modifie uniquement son entrée : tous les
paragraphes qui portent cet index retrouvent le nouveau nom par référence.

Le nommage peut ensuite proposer un rapprochement avec les locuteurs d’autres
entretiens. Ce parcours est distinct du renommage lui-même et ne transforme pas
un nom en identifiant ; voir [personnes.md](personnes.md).

## Attribuer un tour de parole

Sans sélection de texte, le geste change l’attribut `loc` du paragraphe courant.
Avec une sélection, `attribuerSelectionTr` prépare une transaction qui scinde
si nécessaire les paragraphes aux bornes retenues et attribue le locuteur à la
partie sélectionnée.

Le locuteur appartient donc au **bloc**, pas à une annotation de plage. Un
codage thématique peut traverser plusieurs locuteurs, alors qu’attribuer un
locuteur à une portion de paragraphe crée une frontière de bloc. Deux paragraphes
adjacents portant le même index peuvent être rendus comme un même tour sans être
fusionnés physiquement.

Le composable enregistre les anciennes attributions pour le journal, actualise
les projections et planifie la sauvegarde de l’entretien.

## Supprimer un locuteur

La suppression ne doit pas laisser de référence pendante : l’orchestration
retire les attributions `loc` des blocs concernés et enlève l’identifiant stable
des cibles des notes. Si des blocs l’utilisent, le panneau demande une confirmation.

Le retrait de la seule entrée dans le tableau des locuteurs ne suffit donc pas.
Le module pur `supprimerLocuteur` laisse volontairement ces effets à l’appelant.
La fiche Personne éventuellement référencée n’est pas supprimée avec le locuteur.

## Rôle, pseudonyme et couleur

- `interviewer` indique celui qui pose les questions et participe au rendu des
  tours ; le `?` historique est réintroduit pour les représentations compatibles,
  il ne constitue pas l’identité du locuteur.
- `pseudo` pseudonymise l’étiquette du tour, sans modifier le nom stocké ni les
  occurrences de ce nom dans la transcription.
- `pseudoEtat: 'refuse'` conserve un refus importé de SonalPi1, prioritaire sur
  le pseudonyme. L’interface actuelle ne propose plus ce refus à la saisie ;
  poser un pseudo retire cet ancien état.
- `couleur`, si présente, prime sur la palette automatique calculée depuis
  l’index. Un renommage ne change donc pas la couleur automatique.

`libelleGouttiere` est la dérivation pure commune pour les parts du libellé.
Ne pas inscrire le pseudonyme à la place du nom dans les paragraphes ni créer
une règle de pseudonymisation textuelle comme effet de cette saisie.

## Valeurs et lecture seule

Les valeurs des variables de portée locuteur vivent dans `valeursLoc`. Une
personne liée ne devient pas propriétaire de ces valeurs ; deux entretiens
peuvent conserver des valeurs différentes pour la même personne.

L’édition du locuteur suit les droits de la session d’entretien. La consultation
et le rendu restent possibles sans droit d’écriture. La disponibilité du
répertoire Personnes est une question séparée des droits d’édition du texte.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Modèle pur et libellés | `src/shared/entretien/locuteurs.ts` |
| Orchestration | `src/renderer/composables/entretien/useLocuteursEntretien.ts` |
| Panneau | `src/renderer/components/traiter/entretien/PanneauLocuteursEntretien.vue` |
| Transactions d’attribution | `src/renderer/editor/attribution.ts` |
| Rendu des tours | `src/renderer/editor/locuteursGutter.ts` |

Tests principaux : `test/locuteurs.test.ts`, `test/attribution.test.ts` et
`e2e/locuteurs.e2e.ts`. Les parcours de nommage et de rapprochement sont recensés
dans [personnes.md](personnes.md).
