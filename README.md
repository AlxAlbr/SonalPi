# SonalPiTestV2

Réécriture du cœur de **SonalPi** pour essayer de simplifier le fonctionnement et le code.
Version de test de la réécriture en V2.

> 📄 **Vous venez de SonalPi V1 ?** → [Passer de SonalPi V1 à la V2 (guide de migration)](docs/user/migration-v1.md)

## En bref

- **Deux niveaux de données** : le **Corpus** (définitions : codebook, variables EAV, règles
  d'anonymisation) et l'**Entretien** (applications : codages, masquages, commentaires). Pour
  chaque donnée, deux états : ce qui est **stocké** dans les fichiers et ce qui est **calculé**
  à la demande (requêtes, agrégations).
- **Un modèle d'objet réduit** par rapport à SonalPi : les trois overlays inline de V1 (codage /
  anonymisation / commentaire) **fusionnent** en un seul concept — `Annotation` — et le Corpus ne
  garde que des **références légères** aux entretiens. Plus de tables dupliquées local↔corpus :
  une seule vérité par donnée.
- **Édition WYSIWYG** (TipTap/ProseMirror), mais le cœur applicatif vit **hors de l'éditeur** :
  remap des positions, décorations, commandes métier pures, persistance — tout est délibérément
  séparé du DOM, donc **testable headless**.

Les détails techniques (modèle d'objet, représentations des données, architecture, développement)
sont dans la **[documentation développeur](docs/dev/README.md)**.

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

## Documentation

| Public | Doc |
|---|---|
| Utilisateur | [Migration SonalPi V1 → V2](docs/user/migration-v1.md) |
| Développeur | [Documentation développeur](docs/dev/README.md) |
