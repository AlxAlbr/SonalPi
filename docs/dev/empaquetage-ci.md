# Empaquetage multiplateforme et CI — carte développeur

## Chaîne de fabrication

```text
npm run build   (electron-vite → out/)
        │
npm run pack    (electron-builder → dist/ + paquet natif de la plateforme)
```

- `npm run pack:dir` : package local sans installeur (`dist/<plateforme>-unpacked`),
  utile pour valider la config sous WSL avant de pousser en CI.
- La vraie cible est **GitHub Actions**. Quatre actions manuelles sont proposées :
  Linux, Windows, macOS, ou les trois plateformes en parallèle. Le workflow
  `.github/workflows/build.yml` lance aussi les trois builds sur `main` et sur les tags
  `v*.*.*`. La logique commune se trouve dans `.github/workflows/_package.yml`.

## Config electron-builder (champ `build` de package.json)

- `files: ["out/**"]` : tout est déjà regroupé par electron-vite ; electron-builder
  ajoute d'office les `node_modules` de production (le main externalise `chardet`,
  `iconv-lite`… via `externalizeDepsPlugin`).
- `asarUnpack: ["**/pdf.worker*.mjs"]` : **obligatoire** — un worker web ne se charge
  pas depuis `app.asar`. Sans cela l'aperçu PDF est noir dans le paquet installé.
- `extraResources` : `ressources/docsCadreExemples` → `resources/docsCadreExemples`
  et `CorpusTest` → `resources/CorpusTest`. C'est ce que lisent `cheminExemplesDocsCadre()`
  et `ExemplesLocaux` quand `app.isPackaged` (jamais de chemin dans l'asar).
  `CorpusTest/CorpusSynth/` contient les sources communes ; seul son contenu est
  installé dans le dossier de sources du profil. `CorpusTest/CorpusSynthAnnot/`
  contient le modèle V2 annoté, copié dans une nouvelle destination avec des références
  audio réassignées à l'emplacement des sources sur le poste.
- Icône : `build/icon.ico` (Windows) et `build/icon.png` (Linux et macOS), reprise de
  l'icône v1 badgée « 2 » (distinction V1/V2).
- Linux : cibles AppImage + deb (catégorie AudioVideo) ; Windows : NSIS avec choix du
  dossier (`oneClick: false`) et raccourcis bureau/démarrer ; macOS : DMG + ZIP.
- Pas de signature de code : Windows indique « éditeur inconnu » et macOS peut bloquer
  le premier lancement.

## Validation locale (WSL)

`npm run pack:dir` puis vérifier :

- `dist/<plateforme>-unpacked/resources/` contient `CorpusTest/CorpusSynth/`
  (avec `srt/`, `audio/` et `docs/`), `CorpusTest/CorpusSynthAnnot/`
  (avec `corpus.json`, `entretiens/` et `png/`) et `docsCadreExemples` ;
- `app.asar.unpacked/out/renderer/assets/pdf.worker*.mjs` présent.

Les deux corpus exemples peuvent être vérifiés dans le paquet Linux :

```sh
EXEMPLES_E2E_EXECUTABLE="$PWD/dist/linux-unpacked/sonalpi2" \
  npx playwright test e2e/exemples-paquet.e2e.ts --project=local --workers=1
```

Ces tests vérifient les ressources hors asar, l'installation et les chemins audio
sur une copie de travail, sans Docker. Le sélecteur de dossier est simulé.
Le smoke test final (installer, ouvrir DocsCadre, vérifier l'aperçu PDF et le vrai
sélecteur de fichiers) se fait sur Windows : WSLg ne présente pas le sélecteur natif.

## Miroir GitHub

Le dépôt d'origine est GitLab (huma-num) ; GitHub (`PUD-GA/…`) est un **miroir privé**
de travail pour la CI : `git push origin main` + `git push github main`. Pas de
synchronisation automatique tant que GitLab est en panne.