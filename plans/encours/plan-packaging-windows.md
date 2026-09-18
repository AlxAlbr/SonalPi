# Plan — Empaquetage Windows + CI GitHub Actions (repo miroir privé)

> Statut : implémenté (repo miroir privé à créer par l'utilisateur sur
> `github.com/PUD-GA`). Décisions validées : repo GitHub **privé** ; cible
> **Windows** seule ; icône reprise du v1 ; compte `PUD-GA`.
> Validation : `npm run pack:dir` vert localement (extraResources + asarUnpack).

## 1. Objectif

Produire un installateur Windows exécutable de SonalPi2, de façon reproductible
et automatique : compilation `electron-vite` → empaquetage `electron-builder`
→ artefact `.exe` (NSIS) récupérable depuis GitHub Actions. Le build local
sous WSL ne donnant pas un vrai sélecteur/installeur Windows, la CI apporte un
runner Windows natif.

Le repo GitHub est un **miroir privé** : on y pousse le même code que sur
GitLab ; GitHub ne devient pas le dépôt source (huma-num reste l'origine quand
il revient).

## 2. Repo miroir privé

- Créer un repo vide **privé** sur GitHub (compte à confirmer : `AlxAlbr` ?).
- Ce repo porte l'action : `git remote add github <url>` + `git push github main`.
- Stratégie de synchronisation : **push volontaire sur les deux remotes** (`git push origin main && git push github main`), pas de miroir automatique tant que
  GitLab est en panne. Aucun secret GitLab n'est dupliqué.
- Le contenu est du code + fixtures de test (pas de données de corpus) :
  rien de sensible à déplacer. `.gitignore` couvre déjà `out/`, `dist/`,
  `node_modules/` et `test-results/`.

## 3. Empaquetage electron-builder

- Ajouter `electron-builder` en devDependency.
- Config `build` dans `package.json` (ou `electron-builder.yml`) :
  - `appId`, `productName: "SonalPi"` (version source : `package.json`);
  - `directories.output: dist` ;
  - `files: ["out/**"]` — le main est `out/main/index.js` (déjà déclaré) ;
    les `node_modules` de production (chardet, iconv-lite…) sont inclus par
    le comportement par défaut d'electron-builder ;
  - `asarUnpack: ["out/renderer/assets/pdf.worker*.mjs"]` — **indispensable** :
    un worker web ne se charge pas depuis `app.asar` (chargeur Chromium sans
    hook asar). Sans cela, l'aperçu PDF casse dans le paquet ;
  - cible Windows : `nsis` (installeur, par défaut) + `portable` en option ;
  - icône : à fournir (voir §4).
- Scripts npm :
  - `pack` : `npm run build && electron-builder --publish never` (build
    plateforme courante, utile en local WSL avec wine et surtout sur runner) ;
  - `pack:win` : réservé à un vrai Windows.
- Validation du paquet : lancer le `.exe` installé et vérifier DocsCadre (liste,
  exemple, **aperçu PDF**) — l'asarUnpack se valide uniquement sur le paquet.

## 4. Icône et identité

- Aucune icône dans le repo aujourd'hui ; electron-builder exige un `.ico`
  pour Windows (NSIS).
- **Décision à trancher** : fournir une icône `.ico` (importée depuis un PNG),
  ou générer une icône temporaire simple (à replacer ensuite). Le v1 passait
  par `electron-icon-builder` depuis `icon/icon.png`.
- `productName` affiché dans l'installeur : « SonalPi ».

## 5. Workflow GitHub Actions (`.github/workflows/build.yml`)

Sur le modèle du `build.yml` v1, adapté à electron-vite :

- **Job `test`** (ubuntu-latest) : `npm ci`, `npm run typecheck`, `npm test` —
  garde-fou avant empaquetage.
- **Job `package`** (`windows-latest`) :
  - déclencheurs : push sur `main` (artefacts uniquement, rétention courte),
    tags `v*.*.*` (release), `workflow_dispatch` (manuel) ;
  - étapes : checkout, `setup-node` (Node 22 LTS, cache npm), `npm ci`,
    `npm run build`, `npx electron-builder --publish never` (avec
    `CSC_IDENTITY_AUTO_DISCOVERY: false` : pas de signature) ;
  - upload artefacts : `dist/*.exe` ;
  - sur tag : publication Release GitHub (ex. `softprops/action-gh-release`,
    ou l'API via `gh release create`) — **en repo privé, la Release reste
    accessible aux membres** ; le fichier `.exe` est livrable hors repo.
- Aucun secret nécessaire (pas de signature dans un premier temps).

## 6. Validation

1. `npm run pack` sur un Windows (ou runner) → installateur NSIS créé ;
2. smoke test manuel sur Windows : installation, lancement, fenêtre DocsCadre,
   **aperçu PDF** (valide l'asarUnpack), ajout d'un fichier (vrai sélecteur
   Windows) ;
3. les e2e existants (`test:e2e`) tournent sur `out/` non empaqueté — ils
   restent le filet de régression ; on n'y ajoute pas de job « paquet » en CI
   Windows tant que le smoke test manuel n'est pas stabilisé.

## 7. Documentation

- `docs/dev/` : carte « Empaquetage & CI » (commande `pack`, asarUnpack,
  workflow) ;
- `docs/user/` : note de distribution (où télécharger l'installateur, avertissement
  SmartScreen sans signature).

## 8. Hors périmètre (première version)

- Signature de code (l'installeur affichera « Éditeur inconnu ») ;
- macOS / Linux (le v1 en faisait 3 OS ; ici Windows d'abord — les minutes
  macOS ×10 d'un repo privé sont un vrai coût) ;
- auto-update / electron-updater ;
- déploiement dans les stores ;
- miroir automatique GitLab → GitHub (humility : huma-num est en panne).

## Décisions restantes (avant implémentation)

1. Icône : tu fournis un PNG/ICO, ou je génère une icône temporaire ?
2. Cible : Windows seul confirmé (pas macOS/Linux pour l'instant) ?
3. Compte GitHub du repo miroir : `AlxAlbr` (comme le v1) ou autre ?