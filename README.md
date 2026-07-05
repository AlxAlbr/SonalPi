# SonalAsynchro

Réécriture **asynchrone** (plan B) du cœur de **SonalPi** — une app
d'analyse qualitative d'entretiens : importer une transcription, la corriger, attribuer les
locuteurs, thématiser (coder) le texte, saisir des données. Premier incrément **produit** de
la réécriture, sur une architecture propre **sans CRDT/Yjs**.

> **Principe directeur** : **le modèle est la vérité, le DOM n'en est qu'une projection, les
> fichiers sont l'I/O.** Le texte vit dans ProseMirror ; le marquage (codages, anonymisation,
> commentaires) est un **calque d'annotations** qui pointe le texte par positions et *suit* les
> éditions — jamais un découpage du texte. Aucune donnée n'est dupliquée : les inventaires
> (matrice, extraits, compteurs d'usage) sont des **requêtes**, pas des caches.

## Positionnement

- **Domaine** (le *quoi*) : le plan conceptuel de [`../POC2/docs/MODELE_OBJET2.md`](../POC2/docs/MODELE_OBJET2.md)
  (§1–§7 + règles de lecture n°1–3), commun à la cible fichiers et à une future cible Yjs.
- **Technique** (le *comment*, régime fichiers) : [`docs/MODELE_OBJET.md`](docs/MODELE_OBJET.md)
  — conteneur d'état, positions ProseMirror, identités, format natif du dossier de corpus.
- **Réversibilité** : le conteneur d'état est isolé pour qu'on puisse un jour le remplacer par des
  `ydoc` sans toucher au domaine (couture validée à part dans `../SonalSynchroYjs`).
- **Juge de paix** : un export `.sonal` doit se **rouvrir dans SonalPi**. Cf. [`PARITE.md`](PARITE.md).

## Le modèle objet dans le code

Le domaine a **deux agrégats** (frontières de cohérence, [MODELE_OBJET2 §1](../POC2/docs/MODELE_OBJET2.md)),
et la structure du code les reflète directement — un dossier par agrégat, un fichier par concept du
doc, chacun étiqueté par sa section :

| Agrégat | Contenu | Code |
|---|---|---|
| **Corpus** | définitions (codebook, variables EAV) + membership | [`src/shared/corpus/`](src/shared/corpus/) |
| **Entretien** | applications (annotations, locuteurs, valeurs) | [`src/shared/entretien/`](src/shared/entretien/) |

```
src/shared/
  format.ts              le contrat du format natif (types), versionné (FORMAT_VERSION)
  corpus/                ── agrégat Corpus ──
    index.ts             surface publique (barrel) + carte des sections
    categories.ts   §2   codebook : CRUD des thèmes + hiérarchie
    variables.ts    §5   base de données EAV : variables & modalités
    requetes.ts     §10  inventaires = requêtes (usages, matrice, poserValeur)
    import.ts       §12  sas d'import .sonal (fusion idempotente par id)
  entretien/             ── agrégat Entretien ──
    entretien.ts         commandes d'annotation (poser/retirer un codage)
    annotation.ts   §2   le concept unificateur Annotation + requêtes (orphelines)
    locuteurs.ts    §4   locuteurs par entretien (référence par index)
```

Tout ce qui est sous `shared/` est **pur** : aucune I/O, aucun DOM, aucun accès electron — donc
testable en headless (un test garde-fou vérifie mécaniquement que `entretien/` n'importe jamais le
DOM/ProseMirror). On peut lire [MODELE_OBJET2.md](../POC2/docs/MODELE_OBJET2.md) et ce dossier
côte à côte : ils se répondent section par section.

## Structure générale

```
src/
  main/          process Electron : store fichiers (écriture atomique + .bak), IPC, dialogs
  preload/       pont IPC typé (le renderer ne touche jamais au disque)
  renderer/      app Vue 3
    editor/      TipTap/ProseMirror : schéma, remap des positions, décorations, gouttière, snap
    import/      sas .sonal / .srt / .vtt (convertisseurs SonalPi vendorés) + export
    composables/ orchestration UI (useCorpus, useEntretien, useProfil, sonal)
    components/   Accueil, Corpus, Entretien, TableDonnees
  shared/        le modèle objet pur (voir ci-dessus) — chargé par main ET renderer
```

`shared/` est la frontière **technique** (code commun aux deux process Electron) ; `corpus/` et
`entretien/` sont les frontières **du domaine**. Ne pas confondre les deux découpages.

## Démarrer

```bash
npm install
npm run dev          # app en développement (electron-vite)
npm run build        # build main + preload + renderer
npm run start        # prévisualiser le build

npm test             # tests unitaires (vitest, headless)
npm run test:e2e     # e2e Playwright + Electron (build puis lance ; tourne sous WSLg)
npm run typecheck    # vue-tsc + tsc
```

**Pile** : Electron + Vue 3 + TipTap/ProseMirror (sans Yjs), electron-vite, vitest, Playwright.

## État

Le **set minimum** est complet et prouvé (étapes 0–7 de [`DEMARRAGE.md`](DEMARRAGE.md)) :
corpus local, import/export `.sonal`, édition WYSIWYG avec annotations qui suivent le texte,
thèmes, locuteurs, données EAV, persistance atomique. Couverture : **100 tests unitaires + 24 e2e**,
typecheck et build verts.

Hors set minimum (différé, avec le modèle déjà prêt) : anonymisation (UI), audio/timing,
multi-utilisateur (verrous), round-trip EAV complet vers `.sonal`. Écarts de parité assumés et
décision de suite dans [`BILAN.md`](BILAN.md).

## Documentation

| Doc | Contenu |
|---|---|
| [`docs/MODELE_OBJET.md`](docs/MODELE_OBJET.md) | plan technique (fichiers, positions, identités, format natif) |
| [`../POC2/docs/MODELE_OBJET2.md`](../POC2/docs/MODELE_OBJET2.md) | plan conceptuel (le domaine, les deux agrégats) |
| [`DEMARRAGE.md`](DEMARRAGE.md) | périmètre du set minimum, décisions structurantes (D1–D6), étapes |
| [`BILAN.md`](BILAN.md) | ce qui est livré, écarts de parité assumés, options de suite |
| [`PARITE.md`](PARITE.md) | journal des vérifications manuelles de réouverture dans SonalPi |
| [`SUITE.md`](SUITE.md) | pistes v2 |
