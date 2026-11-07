# Empaquetage et CI — fabriquer une application installable

Le build de développement et le paquet distribué sont deux étapes distinctes :

```text
npm run build       electron-vite → out/
npm run pack:dir    build + electron-builder → dist/<plateforme>-unpacked/
npm run pack        build + electron-builder → dist/ et paquets natifs
```

La configuration vit dans le champ `build` de `package.json`.
Le paquet est fabriqué pour la plateforme de la machine ou du runner : un paquet
Linux validé sous WSL ne constitue pas une validation Windows ou macOS.

## Ressources à préserver

| Configuration | Pourquoi elle existe |
|---|---|
| `files: ["out/**"]` | Embarquer le code compilé ; electron-builder ajoute les dépendances de production nécessaires. |
| `asarUnpack: ["**/pdf.worker*.mjs"]` | Rendre le worker PDF accessible hors de `app.asar`, sinon l’aperçu peut rester noir. |
| `extraResources` pour `CorpusTest` | Fournir les sources et le modèle annoté des [corpus exemples](../accueil/exemples.md). |
| `extraResources` pour `ressources/docsCadreExemples` | Fournir les [documents exemples](../preparer/docs-cadre.md) hors asar. |

Les ressources sont lues depuis `resources/` en mode empaqueté ; ne pas utiliser
un chemin du dépôt de développement. Les scripts npm d’installation et de
fabrication restent ceux de `package.json`.

Les cibles sont AppImage et deb pour Linux, NSIS pour Windows, DMG et ZIP pour
macOS. Les icônes viennent de `build/icon.ico` et `build/icon.png`.
La configuration actuelle ne signe pas les paquets : Windows peut afficher
« éditeur inconnu » et macOS bloquer le premier lancement.

## CI GitHub

`.github/workflows/_package.yml` porte la fabrication commune :

1. installer les dépendances avec `npm ci` sous Node.js 22 ;
2. exécuter le typage et les tests Vitest sur Linux ;
3. fabriquer les plateformes demandées, puis déposer leurs artefacts ;
4. sur un tag de livraison, publier les paquets dans une release GitHub.

`.github/workflows/build.yml` lance les trois plateformes sur `main`, sur les
tags `v*.*.*` et manuellement. Des workflows manuels permettent aussi de cibler
une seule plateforme. Les artefacts du workflow sont conservés sept jours.

La CI n’exécute pas les recettes Electron ni ne démarre les bancs Docker.
Un paquet fabriqué et des tests serveur sautés ne qualifient donc pas le parcours
distant. Pour les règles de push et le rôle de GitHub, voir [remotes](git-remotes.md).

## Vérifier un paquet local

Après `npm run pack:dir`, contrôler :

- `resources/CorpusTest/CorpusSynth/` avec `srt/`, `audio/` et `docs/` ;
- `resources/CorpusTest/CorpusSynthAnnot/` avec `corpus.crp`, `entretiens/` et `png/` ;
- `resources/docsCadreExemples/` ;
- le worker PDF dans `resources/app.asar.unpacked/out/renderer/assets/`.

Les exemples peuvent être testés dans le paquet Linux sans Docker :

```sh
EXEMPLES_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" \
  npx playwright test e2e/exemples-paquet.e2e.ts --project=local --workers=1
```

Cette recette vérifie l’installation des deux exemples et leurs références audio,
avec un sélecteur de dossier simulé. Compléter sur la plateforme cible par un
contrôle manuel : installer, choisir un vrai dossier, ouvrir les documents du
projet et vérifier l’aperçu PDF. Sous WSLg, la recette simulée ne valide pas le
sélecteur natif Windows.
