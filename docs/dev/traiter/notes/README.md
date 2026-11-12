# Notes — vue d’ensemble

Une note est un document autonome de l’entretien, hors de la transcription.
Elle n’a aucune position ProseMirror. La vue Notes du corpus rassemble ces
notes sans en devenir propriétaire.

## Les notions à distinguer

| Notion | Stockage | Sens |
|---|---|---|
| Catégorie de note | `corpus.crp.categoriesNote` | Définition partagée : identifiant, nom et couleur. |
| Note | `EntretienFichier.notes` | Contenu, catégorie, statut, dates et ordre manuel. |
| Lien vers un commentaire | `data-liens` dans le corps de la note | Références aux annotations de commentaire du même entretien. |
| Locuteurs concernés | `Note.locuteurIds` | Zéro, un ou plusieurs identifiants stables de locuteurs de cet entretien. |
| Inventaire corpus | Rien | Projection transversale des notes et résolution de leurs commentaires. |

Les catégories de notes sont indépendantes des thèmes du codebook. Les quatre
catégories par défaut sont « post-collecte », « résumé », « réflexion » et
« générale ». Leurs identifiants sont stables ; les catégories créées reçoivent
un nouvel identifiant.

## Données enregistrées

`Note` porte les champs suivants :

- `id`, `categorieId` et `titre` ;
- `date`, facultative, distincte des dates techniques ;
- `statut` : `prive` ou `public` ; une note nouvelle est privée ;
- `corps` : HTML restreint et nettoyé ;
- `locuteurIds`, facultatif ; une liste vide désigne une note générale ;
- `rang` : ordre manuel dans l’entretien ;
- `creeLe` et `modifieLe`, ce dernier pouvant être nul.

Les anciens fichiers sans notes donnent une liste vide. La normalisation
complète les champs absents, retient le statut privé sauf mention explicite
`public` et déduplique les identifiants de locuteurs. Elle ne remplace pas le
nettoyage HTML, effectué dans le renderer.

## Ce qui fait foi

1. Le contenu reste dans l’entretien, jamais dans `corpus.crp`.
2. Renommer ou recolorer une catégorie ne réécrit pas les notes.
3. Les commentaires et leurs libellés affichés ne sont pas copiés dans la note.
4. Les personnes agrègent les notes de leurs locuteurs sans les déplacer.
5. `statut` règle notamment l’inclusion dans les exports de transcription ; ce
   n’est pas un droit d’accès par utilisateur ni un chiffrement.
6. Les notes sont des champs libres : la pseudonymisation du texte ne nettoie
   pas automatiquement leur contenu.

## Carte du code

| Responsabilité | Emplacement |
|---|---|
| Types `Note` et `NoteCategory` | `src/shared/format.ts` |
| Normalisation, catégories par défaut, rangs | `src/shared/entretien/notes.ts` |
| Inventaire, commandes et comparaison d’état | `src/shared/corpus/notes.ts` |
| CRUD des catégories | `src/shared/corpus/categories.ts` |
| Édition dans l’entretien | `src/renderer/composables/entretien/useNotesEntretien.ts` |
| Nettoyage HTML et références affichées | `src/renderer/notes/sanitiser.ts` |
| Consultation corpus | `src/renderer/composables/corpus/useNotesCorpus.ts` |
| Gestion des catégories | `src/renderer/composables/corpus/useCategoriesNotesCorpus.ts` |
| Stockage et journal corpus | `src/main/corpusStore.ts` |

Le [guide utilisateur](../../../user/traiter/notes.html) décrit les gestes locaux,
les deux modes d’enregistrement, les catégories partagées et les précautions de diffusion.
Les contrôles de confidentialité distinguent le statut, l’accès au corpus et l’export :
`test/notesMarkdown.test.ts` conserve les privées reçues et l’ordre d’affichage ;
`test/exportFormats.test.ts` montre qu’une transcription pseudonymisée ne nettoie
pas la prose des notes publiques.

## Parcours de lecture

- [entretien.md](entretien.md) : édition, HTML restreint, commentaires et locuteurs.
- [corpus.md](corpus.md) : inventaire, filtres, édition locale, distant et exports.
- [Locuteurs et personnes](../locuteurs/README.md) : identité des cibles et
  agrégation des notes.
- [Modèle objet](../../modele-objet.md#notes-cas-et-recueils) : place dans le format.
