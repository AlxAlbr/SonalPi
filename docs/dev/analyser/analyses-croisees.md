# Analyses croisées — repères développeur

L’outil calcule une **matrice thèmes × entretiens**, avec les passages qui
justifient chaque cellule. Ce n’est ni une matrice de cooccurrences entre thèmes,
ni une analyse statistique des variables. Le résultat et la sélection restent
en mémoire ; le calcul ne modifie aucune donnée du corpus.

La procédure utilisateur est décrite dans
[Comparer avec les analyses croisées](../../user/analyser/analyses-croisees.html).
Elle distingue les trois mesures, la présentation et le périmètre exporté.
[Vérifier et interpréter les résultats](../../user/analyser/verifier-resultats.html)
relie ces contrôles aux autres outils, sans confondre fraîcheur, complétude et
validité de l’interprétation.

## Sens des mesures

Le moteur reçoit les contributions thématiques de chaque entretien, leurs bornes
ProseMirror et les tours préparés depuis les paragraphes. Pour un thème donné,
il découpe les contributions aux frontières de tours, réunit les recouvrements
et les plages contiguës d’un même tour, puis produit :

| Mesure | Définition |
|---|---|
| Passages | Nombre de plages réunies, pas nombre d’annotations de codage. |
| Volume | Somme des longueurs source `to - from`, sans doubler les recouvrements d’un même thème. |
| Couverture | Volume / longueur source de l’entretien × 100 ; inconnue si le dénominateur ne permet pas le calcul. |

Ces longueurs sont exprimées sur le document ProseMirror. Ce ne sont ni des
durées audio ni les longueurs du texte affiché après pseudonymisation.

Un entretien sans codage produit des zéros. Une source indisponible ne produit
pas de cellule et reste signalée comme indisponible : **inconnu n’est pas zéro**.
Une annotation invalide est ignorée avec un diagnostic.

Les entretiens sont disjoints : les totaux par thème additionnent leurs passages
et volumes. La couverture totale est recalculée sur les longueurs cumulées,
jamais moyennée à partir des pourcentages. À l’inverse, les thèmes peuvent se
superposer : aucun total par entretien n’est produit en additionnant les thèmes.

## Chargement et consultation

`useAnalysesCroisees` initialise la sélection au premier accès, sans lancer le
calcul. Il faut au moins un thème et un entretien, puis une actualisation explicite.
Le chargement utilise `useSourcesAnalyseCorpus`, partagé avec Synthèse : cache
par version, entretien ouvert en mémoire, autres lectures sans verrou, quatre
sources simultanées au maximum. En distant, la lecture ne force pas la publication
ni un nouveau tirage serveur.

Le moteur pur ne manipule aucun texte affichable. Seule la cellule consultée
projette ses passages, leur contexte et leurs locuteurs, pseudonymisés par défaut.
Le mode original change ce détail, pas les chiffres. Une cellule peut aussi
préparer les critères correspondants dans [Synthèse](synthese.md).

## Fraîcheur et export

Modifier les sources, le codebook ou la sélection rend le résultat périmé sans
l’effacer. Navigation vers les passages et export attendent alors un nouveau
calcul. Les générations écartent les réponses tardives après réinitialisation ;
changer de corpus remet la session à zéro.

Contrairement à Synthèse et Lexico, **un résultat incomplet mais à jour peut être
exporté**. Le CSV/TSV indique son état et ses diagnostics, et laisse les valeurs
indisponibles vides. Il propose une matrice large ou une table longue.

L’export reprend la sélection du dernier calcul, pas seulement les lignes et
colonnes visibles après recherche ou masquage des zéros. Il contient mesures et
intitulés, sans transcription ; les noms de thèmes et titres d’entretien restent
des champs libres à vérifier avant diffusion.

La destination proposée est `resultats/analyses-croisees/` en local, ou Documents
sur le poste pour un corpus distant, sans publication automatique sur le serveur.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Mesures, réunion des plages, totaux et diagnostics | `src/shared/analysesCroisees/moteur.ts`, `types.ts` |
| Contributions source et détail textuel | `src/renderer/editor/analysesCroisees.ts` |
| Chargement partagé | `src/renderer/composables/corpus/useSourcesAnalyseCorpus.ts` |
| Sélection, calcul et fraîcheur | `src/renderer/composables/corpus/useAnalysesCroisees.ts` |
| Matrice et détail de cellule | `src/renderer/components/analyser/analyses-croisees/` |
| Sérialisation et destination d’export | `src/shared/analysesCroisees/export.ts`, `src/main/index.ts` |

Tests : `test/analysesCroisees.test.ts` (plages, mesures, indisponibilité et export)
et `test/parcoursAnalyse.test.ts` (critères du parcours guidé). La navigation
commune est couverte par `test/espacesTravail.test.ts`.
