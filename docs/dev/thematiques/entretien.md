# Thématiques dans un entretien

Un codage thématique est une annotation portée par l’entretien. Le thème reste
une définition du corpus et peut être renommé, recoloré ou documenté sans
réécrire les entretiens qui le référencent.

## Données enregistrées

Une annotation thématique utilise la forme commune des annotations :

```ts
{
  id: string
  type: 'codage'
  from: number
  to: number
  auteur: string
  code: string
}
```

`from` et `to` sont des positions ProseMirror. `code` contient l’identifiant
opaque `Categorie.id`, jamais le nom visible ni `codeExport`.

Une annotation dont la plage est refermée ou invalide reste détectable comme
orpheline. Les opérations de division la présentent séparément, car elle doit
être répartie explicitement avant une suppression de source.

## Poser et retirer un codage

Dans l’onglet Thématiques de l’entretien :

1. l’utilisateur sélectionne du texte ;
2. il clique sur un thème actif ;
3. le même geste retire le thème lorsqu’il couvre déjà la sélection.

`useAnnotationsEntretien.ts` porte le geste et l’autosauvegarde de l’entretien.
Le panneau ne modifie pas directement le document ou les fichiers. Un thème
passif refuse un nouveau codage et ses décorations sont masquées sans supprimer
les annotations existantes.

Le clic sur la flèche d’un thème parent replie seulement l’affichage de ses
descendants. Cet état appartient à la vue et n’est jamais enregistré dans le
corpus.

## Rendu dans le texte

Les décorations résolvent à la demande les propriétés du codebook :

- `couleur` produit le fond du passage ;
- `taille` agrandit et met en valeur le texte codé ;
- `actif` décide si le codage est visible ;
- `nom` alimente les titres et le journal.

Plusieurs codages peuvent se chevaucher. Le rendu compose leurs couleurs, mais
chaque annotation conserve son identité et sa plage. Modifier une définition ne
copie rien dans l’entretien : le rafraîchissement des décorations suffit.

Le résumé thématique de l’entretien est lui aussi dérivé. Il découpe l’axe du
texte en segments élémentaires portant un ou plusieurs identifiants de thème.
Les cartes Corpus et la bande du lecteur audio utilisent cette projection.

## Consulter les descriptions

La description n’entre pas dans le codage et n’est jamais copiée sur
l’annotation. Dans le panneau :

- `ⓘ` affiche ou masque la description d’un thème ;
- un emplacement est réservé pour les thèmes sans description afin d’aligner
  les compteurs ;
- `ⓘ tout` ouvre ou ferme toutes les descriptions ;
- cliquer ces boutons ne déclenche aucun codage.

L’édition du nom et de la description passe par la fenêtre partagée
`EditionThemes.vue`, donc par une mutation de définition du corpus.

## Lecture seule et corpus distant

Un entretien distant sans session éditable conserve la consultation du codebook
et de ses descriptions, mais le bouton de thème ne peut pas écrire de codage.
Les protections de session et de publication sont celles du fournisseur ; elles
ne changent pas le modèle de l’annotation.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Geste de codage | `src/renderer/composables/entretien/useAnnotationsEntretien.ts` |
| Panneau | `src/renderer/components/traiter/entretien/PanneauThemesEntretien.vue` |
| Décorations | `src/renderer/editor/decorations.ts` |
| Résumé d’un entretien | `src/shared/corpus/requetes.ts` |
| Sauvegarde | `src/renderer/composables/useEntretien.ts` et `src/main/corpusStore.ts` |

Tests principaux :

- `e2e/themes.e2e.ts` : codage, édition des définitions, descriptions et résumé ;
- `e2e/theme-entretien.e2e.ts` : panneau, liste longue, hiérarchie et thèmes
  passifs ;
- `e2e/marquage.e2e.ts` : pose et retrait des annotations ;
- `test/corpus.test.ts` : projection du résumé thématique.
