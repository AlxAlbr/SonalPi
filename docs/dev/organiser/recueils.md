# Recueils — repères développeur

Un recueil est un **document éditorial ordonné** : titres, textes de liaison et
passages d’entretiens. Contrairement à un [cas](cas.md), il ne sélectionne rien
par règle analytique. Son contenu est assemblé explicitement par l’utilisateur.

## Modèle à comprendre

`corpus.crp.recueils` conserve les recueils, chacun avec une identité, un nom,
ses dates, un `modeTexte` et un tableau ordonné `items`. Un item est :

- un titre de niveau 1 à 4 ;
- un texte de liaison ;
- un passage référencé par `{ entretienId, repereId }`, accompagné d’un
  commentaire éditorial propre au recueil.

Le texte du passage n’est **jamais copié** dans le recueil. Le repère et ses
bornes ProseMirror restent dans l’entretien et sont remappés avec ses corrections.
Le même passage peut apparaître plusieurs fois avec des commentaires différents.
Supprimer un item ou le recueil ne supprime ni le repère ni la source.

La hiérarchie des sections se déduit de l’ordre et du niveau des titres : une
section finit au prochain titre de niveau inférieur ou égal. Déplacer ou supprimer
une section agit sur tout cet intervalle. La numérotation est calculée au rendu,
pas enregistrée dans les libellés.

## Ajouter et modifier sans perdre les références

Depuis l’entretien, la sélection est capturée avant l’ouverture du dialogue.
Son repère doit être enregistré avant l’association au recueil. En distant,
la source doit être publiée avant d’enregistrer une référence qui en dépend.
Le dispatch distingue ce geste des simples modifications de définition ; voir
[gestes.md](../distant/gestes.md).

Les mutations utilisent `CommandeRecueils` et l’état attendu de la cible : ancien
nom, item, ordre ou date de modification. Le renderer ne renvoie pas un recueil
complet faisant autorité. En cas d’échec après création du repère, il conserve
l’item et ses identifiants pour reprendre l’ajout ; abandonner ne supprime pas
le repère déjà enregistré. Une création simple de recueil conserve aussi son
identité de commande. Échap peut fermer une tentative sans la perdre ; abandonner
est explicite. Un recueil créé avant l’échec d’association reste conservé même
si l’ajout est ensuite abandonné. Une réponse d’un ancien corpus ne remplit pas
le nouvel écran.

## Projection, erreurs et confidentialité

`projeterRecueil` résout les passages depuis les entretiens courants et produit
une collection de lecture avec leurs états et diagnostics. Le composable charge
chaque source une fois par résolution, utilise la mémoire pour l’entretien ouvert
et ignore les réponses d’une ancienne sélection ou d’un corpus quitté.

Une source absente, un repère introuvable ou orphelin reste visible comme problème.
Ne pas effacer silencieusement l’item, ni conserver une ancienne citation comme
si elle était encore valide.

Le mode de texte, **enregistré sur le recueil**, est pseudonymisé par défaut et
peut être original. Il gouverne les passages et leurs libellés de locuteurs.
Les titres, textes de liaison et commentaires éditoriaux ne sont pas nettoyés
automatiquement par la pseudonymisation.

## Export

L’export Markdown ou TXT résout à nouveau le recueil, puis sérialise cette
projection sans relire ses sources pendant l’écriture. Les options portent sur
les mentions de source, les commentaires et la numérotation.

Si des passages sont indisponibles, l’export est bloqué par défaut. Une confirmation
explicite permet un export incomplet, où les passages manquants sont remplacés
par leurs diagnostics. Le fichier est une matérialisation dans le mode courant,
pas une sauvegarde des références vivantes.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Modèle, commandes et sections | `src/shared/corpus/recueils.ts` |
| Numérotation | `src/shared/corpus/numerotation.ts` |
| Résolution des références communes | `src/renderer/editor/passages.ts` |
| Projection et exports Markdown/TXT | `src/renderer/editor/recueils.ts` |
| Chargement, édition et reprise d’ajout | `src/renderer/composables/corpus/useRecueilsCorpus.ts` |
| Persistance et dispatch fournisseur | `src/main/corpusStore.ts`, `src/main/index.ts` |
| Gestionnaire et dialogue d’association | `src/renderer/components/organiser/recueils/` |

Tests : `test/recueils.test.ts`, `test/recueilsStore.test.ts`,
`test/recueilsRenderer.test.ts` et `e2e/recueils.e2e.ts`. Les interactions avec
les cas sont aussi couvertes par `test/associationsPassage.test.ts`.
Le [résumé des associations d’une sélection](cas.md#associations-du-passage-sélectionné)
est commun aux cas et aux recueils.
