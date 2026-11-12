# Notes à l’échelle du corpus

La vue Notes rassemble les notes des entretiens du corpus. Elle ne crée ni
collection persistée ni copie des contenus.

## Inventaire et consultation

`CorpusStore.notesInventaire()` lit les entretiens et signale ceux qui sont
indisponibles. La projection `inventorierNotes` produit, pour chaque note :

- son entretien et son titre ;
- ses champs affichables et son ordre dans l’entretien ;
- les commentaires liés encore présents dans cet entretien ;
- leur temps audio lorsqu’il peut être calculé depuis les ancres ;
- un état de référence `attendu` pour les commandes ultérieures.

L’interface propose un tableau et une feuille. Recherche, catégories,
entretiens, statut, dates, passages importants et présence de liens sont des
filtres de vue. Les tris par création, date, modification, entretien, catégorie,
statut ou titre ne modifient pas les rangs enregistrés.

Le chargement conserve la dernière lecture disponible en cas d’échec et affiche
l’erreur. Un changement de corpus invalide les réponses de l’ancien chargement.
L’inventaire est notamment relu après une mutation de note ou un nouveau tirage
distant. Ouvrir une note rejoint l’onglet Notes de son entretien.

## Modification et suppression locales

La commande `CommandeNotes` permet de modifier ou de supprimer une note existante.
Elle ne crée pas de note depuis la vue corpus.

Avant écriture, le main vérifie l’appartenance de l’entretien au corpus, sa
lisibilité et l’existence de la note. Il compare ensuite son état sémantique à
`attendu` ; seul `modifieLe` est exclu de cette comparaison. Si la note a changé,
l’opération est refusée et la liste doit être actualisée.

La modification porte sur cinq champs : catégorie, titre, date, statut et corps.
Elle préserve notamment les locuteurs concernés et le rang. La suppression
retire la note puis renumérote les notes restantes. Les deux gestes alimentent
le journal corpus et invalident les projections Notes et Personnes.

Les vues nettoient le corps HTML avant affichage et enregistrement. Le contrôle
de l’état attendu ne remplace pas ce nettoyage.

## Catégories partagées

Les catégories sont créées, renommées ou recolorées au niveau corpus. Une
suppression est refusée tant que des notes utilisent la catégorie : il n’existe
pas de suppression en cascade des notes.

En distant, ces commandes de définition suivent les transactions du fournisseur.
Le retrait d’une catégorie utilisée relève des gardes de suppression de
définition, et pas d’une simple écriture de `corpus.crp`.

## Disponibilité selon le fournisseur

| Parcours | Local | GitLab / WebDAV |
|---|---|---|
| Consulter l’inventaire | Oui | Oui, depuis les données du miroir. |
| Filtrer, trier et exporter en Markdown | Oui | Oui, sans mutation du corpus. |
| Modifier ou supprimer depuis la vue corpus | Oui | Non : geste `note.editer` refusé. |
| Éditer dans l’entretien | Si éditable | Selon les droits de sa session d’entretien. |
| Gérer les catégories | Oui | Selon les gardes des définitions du fournisseur. |

Le renderer et le main refusent l’édition corpus distante. Il ne faut pas lever
ce refus au motif que l’édition d’un entretien est déjà possible : les deux
parcours n’ont pas la même orchestration.

## Exports et confidentialité

L’export Markdown de la vue corpus utilise **les notes filtrées dans leur ordre
affiché**. Il peut donc inclure des notes privées si le filtre les conserve.
Le statut est une information exportée, pas un filtre implicite.

L’export de transcription suit une autre règle : lorsque les notes sont
incluses, les générateurs de formats texte retiennent les notes publiques.
Les passages importants sont conservés sous une représentation textuelle ; les
liens n’embarquent pas une copie des annotations.

Aucun de ces parcours ne pseudonymise automatiquement la prose d’une note.
Vérifier séparément le contenu avant diffusion, même si la transcription est
pseudonymisée.

## Carte du code et tests

| Responsabilité | Emplacement |
|---|---|
| Inventaire et état attendu | `src/shared/corpus/notes.ts` |
| Commandes et journal | `src/main/corpusStore.ts`, `src/main/index.ts` |
| Filtres, tris, chargement | `src/renderer/composables/corpus/useNotesCorpus.ts` |
| Vue et dialogue | `src/renderer/components/traiter/corpus/NotesCorpus.vue`, `ModaleNoteCorpus.vue` |
| Export Markdown | `src/renderer/notes/markdown.ts` |
| Conversion et inclusion dans la transcription | `src/shared/export/notesTexte.ts`, `formatsTexte.ts` |

Tests : `test/notesCorpus.test.ts` (projection et état attendu),
`test/notesCorpusDistant.test.ts` (consultation du miroir et refus d’écriture),
`test/notesMarkdown.test.ts` (export) et `e2e/notes-corpus.e2e.ts` (parcours).
`e2e/documentation-notes.e2e.ts` vérifie aussi de vrais téléchargements Markdown,
avec les notes privées puis un filtre Public, sans modification du fichier source.
Les liens vers les locuteurs et le rang sont contrôlés après édition depuis le corpus.
Le test de lecture seule simule seulement la réponse d’ouverture : il ne qualifie
pas un accès distant réel. `NOTES_E2E_EXECUTABLE` permet de rejouer cette recette
dans le paquet Linux.

La politique commune est décrite dans
[gestes.md](../../distant/gestes.md).
