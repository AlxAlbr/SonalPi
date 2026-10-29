# Journaux d’annulation et sauvegardes locales

La procédure utilisateur est décrite dans
[Revenir sur une modification](../../user/traiter/annuler-restaurer.html).

## Trois mécanismes distincts

- L’historique ProseMirror gère la frappe de l’éditeur avec `Ctrl/Cmd+Z` et
  `Ctrl/Cmd+Maj+Z`.
- Le Journal d’entretien conserve en mémoire jusqu’à dix inverses d’actions de
  modèle pendant l’ouverture de l’entretien.
- Le Journal du corpus conserve en mémoire jusqu’à dix inverses d’opérations
  prises en charge pendant l’ouverture du corpus local.

Aucun de ces deux Journaux n’est persisté. Une action annulée est retirée de la
pile et n’a pas de rétablissement propre au Journal.

## Journal d’entretien

Le modèle commun se trouve dans `src/shared/entretien/journal.ts`. Le composable
`src/renderer/composables/entretien/useJournalEntretien.ts` applique une inverse
seulement si l’état attendu est encore présent. Une cible disparue rend la ligne
inapplicable au lieu de produire une annulation partielle.

Les producteurs actuels couvrent les annotations de thème et de commentaire,
l’attribution et le renommage des locuteurs, ainsi que les valeurs de variables.
La pile est réinitialisée avec l’état de l’entretien.

## Journal du corpus

Les types partagés sont dans `src/shared/corpus/journal.ts`. Le processus
principal applique les inverses dans `src/main/journalCorpus.ts`, sous le verrou
du corpus local. Le composable
`src/renderer/composables/corpus/useJournalCorpus.ts` maintient la pile de la
session et distingue les états annulable, inapplicable et bloqué.

`PanneauJournalCorpus.vue` rend la liste. `ModaleJournalCorpus.vue` est ouverte
par l’action **Actions récentes** du corpus ou avec un filtre depuis Personnes.
Les opérations distantes sont volontairement refusées par ce mécanisme.

## Copie ZIP

`src/main/archiveCorpus.ts` crée un instantané cohérent du corpus local après
vidage des écritures en attente. L’archive exclut les fichiers temporaires, les
liens symboliques et les fichiers techniques de synchronisation ou de verrou.
Elle conserve les références aux médias externes, sans copier les médias situés
hors du dossier du corpus.

La restauration n’écrase pas automatiquement le corpus courant : l’utilisateur
décompresse l’archive dans un dossier vide et ouvre ce dossier comme un corpus
local distinct.

## Recettes

- `e2e/journal.e2e.ts` couvre les inverses de l’entretien.
- `e2e/journal-corpus.e2e.ts` couvre les inverses du corpus et leurs conflits.
- `test/archiveCorpus.test.ts` couvre le contenu et les exclusions du ZIP.
- `e2e/documentation-annuler-restaurer.e2e.ts` couvre le parcours documenté,
  les illustrations et l’ouverture d’une restauration séparée.
