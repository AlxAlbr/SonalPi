# Lexico — index, sélection et interface

Guide utilisateur : [Utiliser Lexico](../user/lexico.md).

## Organisation

| Fichier | Rôle |
| --- | --- |
| `src/shared/lexico/types.ts` | Contrats des occurrences, filtres et lignes agrégées |
| `src/shared/lexico/moteur.ts` | Intersection des dimensions et agrégation pure |
| `src/shared/lexico/resume.ts` | Résumé déterministe des choix |
| `src/shared/lexico/export.ts` | Sérialisation CSV/TSV et protection des cellules |
| `src/shared/lexico/traitements.ts` | Mots outils, regroupements manuels et concaténations |
| `src/main/migrationLexicoV1.ts` | Lecture non destructive des annexes lors d’une migration locale |
| `src/shared/entretien/anon/projectionTexte.ts` | Décisions de pseudonymisation visibles, communes aux passages et exports |
| `src/renderer/editor/lexico.ts` | Lecture ProseMirror, tokenisation et positions source |
| `src/renderer/composables/corpus/useLexicoCorpus.ts` | Chargement borné, fraîcheur, cas et navigation |
| `src/renderer/components/lexico/LexicoModale.vue` | Index, concordances et panneau de filtres |

L’index vit uniquement pendant la session. Les décisions analytiques sont enregistrées
dans `CorpusFichier.lexico` ; les occurrences et tableaux ne le sont pas. Le document ouvert
est lu depuis l’éditeur en mémoire ; les autres sources passent par la lecture sans verrou.
Les lectures ont une concurrence maximale de quatre sources.

## Occurrences et pseudonymisation

Une occurrence garde sa forme normalisée, son libellé affiché, l’entretien, ses bornes
ProseMirror, son locuteur local éventuel, sa personne éventuelle et les valeurs nécessaires
aux filtres. Les annotations thématiques sont projetées par intersection de plages.

Le découpage reconnaît les lettres et nombres Unicode. Une apostrophe ou un trait d’union
interne reste dans la forme. La casse est normalisée en minuscules françaises et les accents
sont conservés.

En mode pseudonymisé, les caractères couverts par une décision visible dotée d’un pseudonyme
ne sont jamais tokenisés. Le pseudonyme devient une seule occurrence, même s’il contient
plusieurs mots. Les annotations imbriquées, exceptions et chevauchements suivent la même
priorité que les passages et exports. Une décision sans pseudonyme reste en clair. Les
concordances sont construites avec les occurrences déjà pseudonymisées et ne relisent pas
le texte original.

## Traitements lexicaux

Le pipeline dérivé est désormais : index source, concaténations, regroupements manuels,
mots outils, filtres de matériaux, puis agrégation. L’index source reste immuable ; chaque
modification des traitements recalcule uniquement les vues dérivées.

Une concaténation réunit des occurrences successives du même entretien et du même locuteur.
La nouvelle occurrence couvre les bornes complètes, réunit les thèmes et conserve les
métadonnées du locuteur. Les règles les plus longues sont appliquées en premier.

Un regroupement remplace la clé d’agrégation mais conserve le texte de chaque occurrence
pour les concordances. Une forme ne peut appartenir qu’à un regroupement courant. Les mots
outils sont comparés à la forme avant et après regroupement afin qu’une règle reste explicite.

`useLexicoCorpus` conserve trente instantanés au maximum pour annuler les modifications.
Chaque modification passe par `corpus:lexicoCommander`. La commande contient la valeur
attendue afin de refuser l’écrasement d’un réglage modifié entre-temps. Elle rejoint le geste
distant `lexico.modifier-traitements`, dans la même transaction que les autres définitions
du corpus.

Le format 9 ajoute le champ optionnel `CorpusFichier.lexico`. L’ouverture d’un format 8
l’initialise avec trois listes vides. La normalisation borne le nombre et la taille des règles,
élimine les doublons et garantit qu’une forme n’appartient qu’à un regroupement. Le champ
optionnel `listesMotsOutils` conserve, au niveau du corpus, les personnalisations des listes
proposées ; une liste absente utilise toujours la définition fournie par l’application.

L’import V1 a lieu pendant la migration du corpus. Le processus principal cherche les
fichiers `.out`, `.lem` et `.cnct` portant le même nom que le `.crp`, puis le parseur pur
produit l’aperçu et les diagnostics affichés dans le bilan de migration. Les annexes d’origine
ne sont jamais modifiées. `.lexaf.json` n’est pas importé, car il représente un résultat
d’analyse.

## Sélection

`SelectionLexico` distingue :

```ts
type SelectionLexico =
  | { mode: 'sans-restriction' }
  | { mode: 'choix'; ids: string[] }
```

Une liste explicite vide ne sélectionne rien. Le moteur applique un OU à l’intérieur
d’une liste et un ET entre dimensions. Les variables de locuteur sont toutes évaluées
sur le locuteur de l’occurrence. Une parole sans locuteur n’est pas assimilée à une
modalité non renseignée.

Les plages de cas viennent de `projeterCasDepuisSourcesPreparees`, avec règles et ajouts
manuels. Plusieurs plages ou cas peuvent rencontrer la même occurrence sans la dupliquer,
car l’index est construit avant leur sélection. Les diagnostics propres à un cas ne sont
affichés que lorsque ce cas est choisi.

Les paroles d’enquêteurs sont reconnues par `Locuteur.interviewer`. Les passages sans
locuteur restent admissibles lorsque ce rôle est exclu.

## Fraîcheur et erreurs

Une modification du modèle marque le calcul comme périmé. L’actualisation remplace
l’index de façon atomique et ignore les réponses d’une génération antérieure. Un changement
de corpus annule le calcul et remet les critères à zéro ; fermer puis rouvrir Lexico dans
le même corpus conserve les critères.

Une source illisible ou une valeur de variable invalide produit un diagnostic. Un résultat
incomplet reste lisible, mais `exportLexicoPossible` empêche son export. La recherche de
forme, le tri et le seuil d’affichage ne modifient ni les occurrences sélectionnées ni le
bilan des matériaux.

Un export local propose par défaut `resultats/lexico/`. Pour un corpus distant, la destination
par défaut est le dossier Documents de la machine. Les résultats régénérables ne sont donc
jamais ajoutés automatiquement aux données partagées du corpus.

## Tests

`test/lexico.test.ts` couvre la substitution pseudonymisée, les décisions imbriquées,
exceptions, chevauchements, sauts internes, positions, portée locale des variables,
l’intersection des thèmes et cas, les traitements lexicaux, l’import V1, le résumé par
complément et la sécurité de l’export. `test/corpusStore.test.ts` couvre la
migration, la persistance et le refus d’une base obsolète. Les projections de cas restent
couvertes par leurs tests dédiés.
