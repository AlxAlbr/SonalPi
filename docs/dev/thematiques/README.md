# Thématiques — vue d’ensemble

Ce dossier décrit le codebook thématique, les codages posés dans les entretiens
et les opérations qui réaffectent plusieurs codages. Il privilégie le modèle
mental, les invariants et la carte du code. Les mécanismes généraux de transport
restent documentés dans `gitlab.md`, `multi-utilisateur.md` et
`gestes-fournisseur.md`.

## Les trois notions à distinguer

| Notion | Stockage | Sens |
|---|---|---|
| Thème | `corpus.json.codebook` | Définition partagée : nom, description, couleur, taille, ordre et parent. |
| Codage | `Annotation{type:'codage'}` dans un entretien | Application d’un thème à une plage de texte. |
| Résumé thématique | Rien | Vue dérivée des codages, projetée sur l’axe du texte. |

L’interface parle de **thème**. Le modèle historique et certains noms de code
emploient encore **catégorie** ou **codebook** pour la même définition partagée.
Un entretien ne copie jamais le nom, la couleur ou la description du thème : son
annotation conserve uniquement l’identifiant `code`.

## Ce qui fait foi

1. La définition du thème vit dans le codebook du corpus.
2. L’application au texte vit dans une annotation de l’entretien.
3. L’identifiant `Categorie.id` relie les deux ; `codeExport` n’est qu’un code de
   compatibilité lisible.
4. L’ordre et la hiérarchie sont portés par `ordre` et `parent`, pas par
   l’indentation affichée.
5. Les compteurs d’usage et les résumés sont recalculés depuis les entretiens.
6. Un thème passif reste stocké avec ses codages ; il est masqué et ne peut pas
   recevoir de nouveau codage tant qu’il n’est pas réactivé.

## Description et compatibilité SonalPi1

SonalPi1 stockait le nom et la description dans une seule chaîne :
`Nom//description`. SonalPi2 les sépare dans `Categorie.nom` et
`Categorie.description`.

- l’import d’un `.sonal` et la migration d’un `.crp` découpent la chaîne au
  premier `//` ;
- les migrations locale et GitLab utilisent le même convertisseur ;
- un ancien corpus SonalPi2 portant encore cette convention est normalisé en
  mémoire à l’ouverture ;
- l’export `.sonal` recompose `Nom//description` ;
- l’export QualCoder place la description dans le mémo du code.

La description reste facultative. Dans les panneaux Corpus et Entretien, le
bouton `ⓘ` la déplie sans modifier les codages ; `ⓘ tout` affiche ou masque toutes
les descriptions disponibles.

## Organisation du code

| Responsabilité | Emplacement principal |
|---|---|
| Type `Categorie` et contrats | `src/shared/format.ts` |
| CRUD, hiérarchie et compatibilité V1 | `src/shared/corpus/categories.ts` |
| Compteurs et résumés | `src/shared/corpus/requetes.ts` |
| Codage dans l’entretien | `src/renderer/composables/entretien/useAnnotationsEntretien.ts` |
| Orchestration du codebook | `src/renderer/composables/corpus/useThemesCorpus.ts` |
| Édition des thèmes | `src/renderer/components/traiter/partages/themes/EditionThemes.vue` |
| Panneau de codage | `src/renderer/components/traiter/entretien/PanneauThemesEntretien.vue` |
| Consultation au corpus | `src/renderer/components/traiter/corpus/Corpus.vue` |
| Opérations de réaffectation pures | `src/shared/corpus/themes.ts` |
| Services et publications | `src/main/operationsThemes.ts`, `src/main/{gitlab,distant}/` |

La logique métier pure reste dans `src/shared/`. Le renderer exprime les gestes et
présente les bilans ; le main possède les fichiers, les transactions et les
protocoles distants.

## Parcours de lecture

- [entretien.md](entretien.md) : codage d’une plage, affichage et thèmes passifs.
- [corpus.md](corpus.md) : codebook, hiérarchie, import/export et opérations
  métier communes.
- [fournisseurs.md](fournisseurs.md) : exécution locale, GitLab et WebDAV,
  journaux et reprise.

Pour la place du codebook dans le modèle général, voir aussi
[`../modele-objet.md`](../modele-objet.md#5-codebook--requêtes). Pour la matrice
de disponibilité des gestes, voir
[`../gestes-fournisseur.md`](../gestes-fournisseur.md).
