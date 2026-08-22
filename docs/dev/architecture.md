# Architecture

## Structure générale

```
src/
  main/          process Electron : store fichiers (écriture atomique + .bak), IPC, dialogs
  preload/       pont IPC typé (le renderer ne touche jamais au disque)
  renderer/      app Vue 3
    editor/      TipTap/ProseMirror : schéma, remap des positions, décorations, gouttière, snap
    import/      sas .sonal / .srt / .vtt (convertisseurs SonalPi vendorés) + export
    composables/ orchestration UI (useCorpus, useEntretien, useProfil, sonal)
    components/  Accueil, Corpus, Entretien, TableDonnees
  shared/        le modèle objet pur — chargé par main ET renderer
```

`shared/` est la frontière **technique** (code commun aux deux process Electron) ; `corpus/` et
`entretien/` sont les frontières **du domaine**. Ne pas confondre les deux découpages.

## Les process Electron

| Process | Rôle |
|---|---|
| **main** (`src/main/`) | possède le disque : sérialise les entretiens (`corpusStore.ts`, écriture atomique `write-tmp-rename` + `.bak`), relit et vérifie `formatVersion`, gère l'IPC et les dialogues |
| **preload** (`src/preload/`) | pont IPC typé — le renderer **ne touche jamais au disque** |
| **renderer** (`src/renderer/`) | l'app Vue 3 : éditeur TipTap/ProseMirror, composables d'orchestration, composants |
| **shared** (`src/shared/`) | le modèle objet **pur**, chargé par main ET renderer |

Le flux de persistance est toujours : commande de domaine → mise à jour du modèle (en mémoire, la
vérité) → sauvegarde via IPC → le rendu suit (voir [donnees.md — interactions](donnees.md)).

## La frontière `shared/` pure

Tout ce qui est sous `shared/` est **pur** : aucune I/O, aucun DOM, aucun accès electron. C'est
ce qui rend le domaine **testable en headless**. Un test **garde-fou** — le test
**« discipline d'architecture »** de `test/remap.test.ts` — vérifie mécaniquement que
`entretien/` n'importe jamais le DOM/ProseMirror : il parcourt les sources de `src/shared/entretien/`,
résout chaque import et s'assure que le résultat reste DANS `src/shared/` (jamais un package ni
`.`/`window`).

Le stockage (le disque) est **séparé** du domaine : `shared/` contient les fonctions métier pures,
`main/corpusStore.ts` leur I/O. C'est le pendant logiciel de la séparation
« le modèle vs sa persistance » décrite dans [donnees.md](donnees.md).
