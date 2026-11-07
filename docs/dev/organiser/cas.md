# Cas analytiques — repères développeur

Un cas est une **unité d’étude** : il rassemble des matériaux par règles et par
ajouts manuels, sans copier les transcriptions. Ce n’est ni une personne, ni un
thème, ni un [recueil éditorial](recueils.md). Il peut être vide et le rester.

Les cas servent aussi à **préparer un export vers d’autres CAQDAS** (logiciels
d’analyse qualitative) : ils explicitent les unités d’étude, les passages qui
leur appartiennent et leurs attributs, pour poursuivre l’analyse dans le logiciel
cible. L’export actuellement disponible vise QualCoder ; cela ne suppose pas
une prise en charge de tous les CAQDAS ni une équivalence parfaite de leurs modèles.

## Définitions et références vivantes

| Donnée | Propriétaire |
|---|---|
| Nom, mémo, règles et rattachements | `corpus.crp.cas` |
| Organisation en familles et recettes partagées | `corpus.crp.famillesCas` |
| Définitions des attributs | `corpus.crp.attributsCas` |
| Valeurs d’attributs saisies et recettes propres | Le cas |
| Bornes d’un passage manuel | `EntretienFichier.reperesPassages` |
| Passages résolus, valeurs dérivées et diagnostics | Projection en mémoire, jamais enregistrée comme vérité |

Un rattachement manuel contient `{ entretienId, repereId }`, pas du texte, des
bornes copiées ni un identifiant de codage. Les positions ProseMirror restent
dans l’entretien et suivent les corrections par remappage. Retirer le rattachement
ne supprime ni son repère ni ses usages dans d’autres cas ou recueils.

Les règles sélectionnent les interventions de personnes, des entretiens entiers
ou les propriétaires d’une modalité. La portée est essentielle : une variable
d’entretien retient le document entier ; une variable de locuteur retient les
interventions des locuteurs correspondants, même sans personne associée.
Les règles d’entretien entier incluent aussi les futurs ajouts de texte.

## Projection et lecture

`renderer/editor/cas.ts` résout les règles et les rattachements depuis les sources
courantes. L’entretien ouvert est lu en mémoire ; les autres sont chargés sans
verrou d’édition. Une source inaccessible reste un diagnostic, pas la preuve
que le cas est vide. Un repère orphelin conserve sa référence.

Les vues `tous`, `regles` et `manuels` filtrent la lecture, pas les données.
Les contributions conservent leur provenance ; les métriques de volume utilisent
leur union par entretien pour éviter le double compte. Le nombre de contributions
peut donc dépasser celui des plages distinctes. Les métriques textuelles restent
calculées sur l’original, indépendamment du mode d’affichage pseudonymisé.

## Visibilité dans les analyses

Synthèse et Lexico déterminent la présence de cas depuis leurs définitions,
chargées avec le corpus et renouvelées après commandes ou tirages distants.
Un cas vide suffit à rendre la dimension disponible ; une erreur de projection
ne doit pas masquer les cas comme s’il n’en existait aucun.

Sans définition, la dimension Cas disparaît et sa consultation se replie vers
Thèmes dans Synthèse, Entretiens dans Lexico, sans changer les critères ni lancer
de calcul. Un filtre visant des cas supprimés reste signalé avec une action
explicite de retrait. Retirer ce critère ne réécrit pas l’ancien résultat de Synthèse.

## Familles et attributs

Une famille organise des cas issus des modalités d’une variable. Ses membres
se déduisent de `Cas.familleId` ; il n’y a pas de seconde liste ni de cas agrégat.
La création et le complément sont explicites : découvrir une nouvelle modalité
ne crée aucun cas. Dissoudre la famille conserve les cas et leurs matériaux.

Les attributs de cas forment un registre **distinct des variables d’entretien ou
de locuteur**. Une valeur est saisie ou dérivée, jamais les deux sous le même
identifiant. La dérivation stocke une recette, pas sa dernière valeur calculée.

Elle observe uniquement les propriétaires sélectionnés par les règles, y compris
ceux sans parole, et non les passages ajoutés manuellement. La portée de la
variable doit correspondre à celle des observations. Une valeur unique avec des
manques reste affichable avec avertissement ; des valeurs contradictoires ou une
lecture non vérifiable rendent la dérivation indisponible. Dans une famille,
un tel problème suspend cet attribut pour **tous ses membres**, sans supprimer
la recette. L’actualisation le rétablit après correction.

## Écritures et précautions

- Les mutations passent par `CommandeCas`, avec leurs préconditions ; le renderer
  ne remplace pas le dictionnaire depuis une copie ancienne. Les créations en
  lot valident l’ensemble avant mutation et réutilisent leurs identités au rejeu.
- Ajouter une sélection exige d’abord l’enregistrement de son repère puis, en
  distant, la publication de la source avant la référence corpus. Le main
  vérifie le repère ; une association interrompue conserve les identifiants pour
  une nouvelle tentative, sans dupliquer le passage.
- Les commandes de définition et celles qui contrôlent des sources n’ont pas
  les mêmes gardes. L’ajout d’une dérivation exige notamment un contrôle frais
  de ses observations. Voir les [gestes par fournisseur](../distant/gestes.md).
- Supprimer un cas ne supprime aucune personne, transcription ou annotation.
  Retirer un ajout manuel n’efface pas une contribution automatique recouvrante.
- Noms, mémos et attributs sont des champs libres : pseudonymiser les passages
  ne les rend pas anonymes. L’[export QualCoder](export.md) matérialise les
  matériaux ; il ne conserve pas le dynamisme des règles.

## Associations du passage sélectionné

L’entretien affiche un résumé repliable seulement lorsqu’une sélection existe.
`src/renderer/editor/associationsPassage.ts` compare sa plage aux repères des
ajouts manuels et des recueils, ainsi qu’aux règles de cas applicables dans cette
source. Changer la sélection ne reprojette pas tout le corpus.

Les correspondances exactes, incluses et chevauchantes sont conservées. Un cas
sépare l’ajout manuel et chaque raison automatique ; un recueil regroupe ses
occurrences et laisse choisir celle à consulter. Cette consultation est disponible
en lecture seule, empile le passage courant dans les
[retours contextuels](../navigation-espaces.md#retours-au-travail-précédent) et donne
le focus à l’occurrence de recueil après ouverture.

Les définitions de personnes sont réutilisées tant que leur répertoire et le
tirage n’ont pas changé. Repère absent, règle invalide ou lecture impossible
produisent un bilan incomplet, jamais un faux « aucune association ». Texte,
règles, ajouts, retraits, tirages et changement de corpus renouvellent le résumé.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Modèle, commandes, familles et usages | `src/shared/corpus/cas.ts` |
| Observations et attributs dérivés | `src/shared/corpus/observationsAttributs.ts` |
| Projection, provenance et métriques | `src/renderer/editor/cas.ts` |
| Repères et remappage | `src/shared/entretien/reperesPassages.ts`, `src/renderer/editor/remap.ts` |
| Publication et commande corpus | `src/main/casOrchestration.ts`, `src/main/corpusStore.ts`, `src/main/index.ts` |
| Chargement, commandes et reprises | `src/renderer/composables/corpus/useCasCorpus.ts` |
| Gestionnaire, familles et attributs | `src/renderer/components/organiser/cas/` |

Tests de référence : `test/cas.test.ts`, `test/casProjection.test.ts`,
`test/casOrchestration.test.ts`, `test/casFamilles.test.ts` et
`test/casAttributsObservations.test.ts`. Les tests `cas*Renderer` et les scénarios
`e2e/cas.e2e.ts`, `e2e/casFamilles.e2e.ts`, `e2e/casAttributs.e2e.ts` couvrent
l’orchestration et l’interface. Pour la visibilité et les associations :
`test/analysesCasVisibilite.test.ts`, `test/associationsPassage.test.ts`,
`e2e/filtres-cas.e2e.ts` et `e2e/associations-passage.e2e.ts`.
Guide fonctionnel : [Utiliser les cas](../../user/cas.md).
