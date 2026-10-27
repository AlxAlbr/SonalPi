# Lexico — repères développeur

Lexico construit un index de formes et leurs concordances à partir des
transcriptions. **Les occurrences et tableaux restent en mémoire** ; seuls les
traitements lexicaux choisis sont enregistrés dans `corpus.json.lexico`.
Un regroupement lexical ne réécrit jamais les paroles de l’entretien.

## Indexer sans révéler le texte remplacé

Une occurrence porte sa forme, son texte affichable, l’entretien et ses bornes
ProseMirror, ainsi que les thèmes, le locuteur et les valeurs utiles aux filtres.
La tokenisation reconnaît lettres et nombres Unicode, conserve les accents et
les apostrophes ou traits d’union internes, et normalise la casse.

L’index est **pseudonymisé dès sa construction** : les caractères remplacés par
une décision visible ne sont pas tokenisés ; son pseudonyme devient une seule
occurrence, même s’il contient plusieurs mots. Exceptions, inclusions et décisions
sans pseudo suivent la projection commune de pseudonymisation.

Les concordances utilisent ces occurrences, sans retourner chercher du texte
original pour compléter le contexte. Ce principe doit survivre à toute évolution
du découpage ou des traitements. Il ne garantit pas que les autres champs libres,
notamment les titres d’entretien, soient exempts d’identités.

## Pipeline et filtres

```text
Index source → concaténations → regroupements → mots outils
             → sélection des matériaux → agrégation par forme
```

L’index source reste inchangé. Une concaténation réunit une séquence du même
entretien et locuteur ; les règles les plus longues passent en premier. Un
regroupement change la clé d’agrégation, mais conserve le texte des occurrences
pour les concordances. Les mots outils sont évalués avant et après regroupement.

Les filtres combinent un OU dans une sélection et un ET entre dimensions.
Une sélection explicite vide ne signifie pas « tout ». Les variables de locuteur
s’évaluent sur celui de l’occurrence ; l’absence de locuteur n’est pas une valeur
non renseignée. Plusieurs plages de cas ne dupliquent pas une occurrence.

Recherche, tri, fréquence minimale et masquage des nombres sont des réglages
d’affichage du tableau, distincts de cette sélection des matériaux.

## Réglages enregistrés et cycle de lecture

Les traitements et personnalisations des listes de mots outils passent par
`corpus:lexicoCommander`, avec la valeur attendue pour refuser un écrasement
concurrent. Le geste `lexico.modifier-traitements` suit les transactions de
définitions en local, GitLab et WebDAV. L’annulation conserve au plus trente
instantanés en session ; ce n’est pas un historique persistant du corpus.

Le composable possède son propre chargement, limité à quatre sources simultanées.
Il lit l’entretien ouvert en mémoire, les autres sans verrou, et remplace l’index
seulement lorsque le chargement de sa génération est terminé. Les modifications
des sources rendent l’index périmé. Revenir dans Lexico recharge un index absent
ou périmé ; changer de corpus réinitialise critères, résultats et brouillons.
Modifier un traitement recalcule les vues dérivées sans retokeniser les sources.

## Diagnostics et export

Une lecture impossible ou une valeur invalide produit un diagnostic. Ceux d’un
cas ne sont ajoutés que si ce cas est sélectionné. Un index incomplet ou périmé
reste lisible, mais **son export est bloqué**.

L’export CSV/TSV porte sur les lignes effectivement affichées, avec le périmètre
de l’analyse. Il masque le détail des filtres de personnes et de variables privées
et protège les cellules contre l’interprétation en formule de tableur. Les
résultats sont proposés sous `resultats/lexico/` en local, ou Documents sur le
poste en distant, sans publication automatique dans le corpus partagé.

## Où intervenir et vérifier

| Besoin | Fichier |
|---|---|
| Tokenisation, positions et index pseudonymisé | `src/renderer/editor/lexico.ts` |
| Filtres et agrégation | `src/shared/lexico/moteur.ts` |
| Traitements et normalisation des règles | `src/shared/lexico/traitements.ts` |
| Chargement, fraîcheur et commandes | `src/renderer/composables/corpus/useLexicoCorpus.ts` |
| Tableau, filtres et concordances | `src/renderer/components/analyser/lexico/` |
| Export et persistance | `src/shared/lexico/export.ts`, `src/main/corpusStore.ts`, `src/main/index.ts` |

Tests : `test/lexico.test.ts`, `test/corpusStore.test.ts` et
`e2e/espaces-contexte.e2e.ts`. L’import des annexes lexicales SonalPi1 est séparé,
dans `src/main/migrationLexicoV1.ts` et `test/migrationLexicoV1.test.ts` ; voir la
[migration SonalPi1](../migration/README.md#ce-qui-est-converti-ou-conservé).
