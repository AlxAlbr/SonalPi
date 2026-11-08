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

Le dépôt de référence est maintenant `AlxAlbr/SonalPi` (`origin`). `main` porte
encore la V1 ; cette page décrit les fichiers de workflow présents sur les
branches V2, pas le workflow V1 de la branche par défaut.

`.github/workflows/_package.yml` porte la fabrication commune V2 :

1. installer les dépendances avec `npm ci` sous Node.js 22 ;
2. exécuter le typage et les tests Vitest sur Linux ;
3. si ces vérifications réussissent, fabriquer les plateformes demandées,
   puis déposer leurs artefacts.

Le workflow **Build SonalPi V2 — toutes les plateformes**, défini dans
`.github/workflows/build.yml`, se déclenche à chaque push sur les quatre branches :

- `baseV2` ;
- `test-new-design` ;
- `max-suite-aide2` ;
- `essai-crp-multionglet`.

Chaque exécution fabrique Windows (`.exe`), Linux (`.AppImage`, `.deb`) et macOS
(`.dmg`, `.zip`) après le typage et les tests. Si un nouveau push arrive sur la
même branche, son exécution remplace celle encore en cours ; les builds des
branches différentes restent indépendants. Cela peut consommer davantage de
minutes GitHub Actions, particulièrement pour Windows et macOS.

Les workflows V2 ne se déclenchent pas sur les tags et ne publient aucune release.
Le workflow réutilisable ne contient plus d'étape de publication et tous ses
appelants n'accordent que la permission `contents: read`. La commande
`npm run pack` utilise `--publish never`. Le workflow V1 sur `main` reste inchangé.

Des fichiers de workflow manuel existent aussi pour cibler une seule plateforme.
GitHub exige qu'un workflow avec `workflow_dispatch` soit présent sur la branche
par défaut pour proposer son déclenchement ; les nouveaux workflows V2 ne sont
donc pas tous disponibles dans l'interface après leur seul import sur `baseV2`.
Les artefacts des workflows V2 sont conservés sept jours. Pour les télécharger,
ouvrir l'onglet **Actions** du dépôt, sélectionner l'exécution correspondant à la
branche et au commit voulus, puis récupérer `sonalpi-windows`, `sonalpi-linux`
ou `sonalpi-macos` dans la section **Artifacts**. Ces archives servent à tester
les applications ; elles ne sont pas envoyées à l'updater des utilisateurs V1.

Un build de validation produit donc des artefacts sans créer de release stable.
La future livraison V2 vise `2.0.0`, mais ni la version applicative ni les tags
n'ont été modifiés pendant l'import. Ne pas créer de tag V2 dans le circuit stable
V1 avant d'avoir validé la politique de publication et le passage des utilisateurs
vers la V2. La continuité des mises à jour et la migration des corpus sont des
chantiers distincts du déplacement du code source.

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
