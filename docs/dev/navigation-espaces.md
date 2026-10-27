# Navigation — espaces et consultations liées

La navigation décrit le travail affiché, pas le contenu métier du corpus.
Elle doit préserver l’entretien ouvert et ses protections. L’organisation des
composants suit les espaces ; voir le
[README des composants](../../src/renderer/components/README.md).

## Changer d’espace n’est pas fermer l’entretien

`useEspacesTravail.ts` distingue l’écran affiché de la dernière vue de traitement,
`corpus` ou `entretien`. Préparer, Analyser et Organiser peuvent masquer l’éditeur
sans le démonter ni fermer sa session. Revenir à Traiter retrouve cette vue.

Le watcher de `vue` met l’audio en pause dès que l’écran n’est plus Entretien.
Revenir ne relance jamais la lecture. En revanche, `retourCorpus()` et
`allerAccueil()` sont de vraies fermetures d’entretien : sauvegardes et contrôles
de session peuvent les refuser. Ouvrir une autre source réutilise aussi ce cycle,
pas une simple affectation d’identifiant.

Les sous-espaces et panneaux conservent leurs réglages en session. Le changement
de corpus réinitialise les espaces et invalide les réponses asynchrones de
l’ancien contexte. Voir [ouverture des corpus](accueil/ouverture.md).

## Retours au travail précédent

Une consultation liée, par exemple ouvrir une source depuis un résultat, conserve
une destination de retour. `useRetoursContextuels.ts` porte une pile de huit
destinations au maximum ; `sonal.ts` fournit leur capture et leur restauration.

| Conservé pour le retour | Non restauré comme contenu |
|---|---|
| Espace, sous-espace, objet sélectionné et onglet d’entretien. | Ancienne transcription ou anciennes décisions métier. |
| Sélection du texte et position audio. | Ancien résultat d’analyse réinjecté dans le modèle. |
| Réglages visuels du panneau : recherche, tri, familles, numérotation. | Modifications annulant le travail fait pendant la consultation. |
| Focus et défilement. | Nouveau calcul lancé implicitement au retour. |

Les panneaux prêtent leurs réglages via `useContextesPanneaux.ts`.
`contexteVisuel.ts` restaure focus et défilement après mise à jour de l’interface.
La sélection du texte suit les corrections de la même source sans créer de
repère persistant ; sa suppression complète est signalée.

Les règles de la pile sont importantes :

- empiler seulement après une ouverture réussie ;
- dépiler seulement après une restauration réussie ; un refus permet de réessayer ;
- réutiliser l’éditeur en mémoire si la source est déjà ouverte ;
- pour changer de source, préparer la sortie selon les droits actuels, sans
  nouvelle écriture en consultation seule ou après rétrogradation ;
- si l’objet a été supprimé, revenir à son panneau avec une explication, sans
  choisir silencieusement un autre objet ;
- conserver l’avertissement d’un résultat périmé ; son actualisation reste explicite.

Une navigation libre par barre, onglet, répertoire ou guidage termine la chaîne.
La fermeture explicite d’un entretien et le changement de corpus l’effacent aussi.
Le [guide pédagogique](accueil/parcours.md) n’est pas un historique de consultations.

## Actions contextuelles sans navigation forcée

Ajouter la sélection à un cas ou un recueil utilise un dialogue limité à cette
action, pas le gestionnaire complet. Celui-ci reste dans l’espace Organiser et
est monté au premier accès.

La sélection est capturée avant l’ouverture, puis vérifiée par
`enregistrerRepereSelection(attendu)` à la confirmation. Annuler avant confirmation
n’écrit rien. Une réussite ne sélectionne pas l’objet dans le gestionnaire caché
et ne force pas à changer d’espace. Les droits et publications restent ceux des
commandes métier ordinaires.

La consultation d’un cas ou recueil associé à la sélection empile le passage
courant dans les retours. Les règles de calcul des associations et les reprises
d’ajout sont décrites avec les [cas](organiser/cas.md#associations-du-passage-sélectionné)
et les [recueils](organiser/recueils.md#ajouter-et-modifier-sans-perdre-les-références).

## Où intervenir et vérifier

| Besoin | Emplacement |
|---|---|
| Espaces, sous-espaces et dernière vue de traitement | `src/renderer/composables/useEspacesTravail.ts` |
| Ouverture, fermeture et sauvegarde de sortie | `src/renderer/composables/corpus/useCycleCorpus.ts` |
| Capture et restauration des destinations | `src/renderer/composables/sonal.ts` |
| Pile et protection des requêtes anciennes | `src/renderer/composables/useRetoursContextuels.ts` |
| Réglages de panneaux et état visuel | `src/renderer/composables/useContextesPanneaux.ts`, `src/renderer/composables/contexteVisuel.ts` |

Tests : `test/retoursContextuels.test.ts`, `test/contexteVisuel.test.ts`,
`test/contextesPanneaux.test.ts`, `test/couturesRenderer.test.ts`,
`e2e/espaces-contexte.e2e.ts`, `e2e/retours-contextuels.e2e.ts` et
`e2e/ajouts-contextuels.e2e.ts`. Les recettes locales ne remplacent pas une
vérification réelle des protections du fournisseur distant.
