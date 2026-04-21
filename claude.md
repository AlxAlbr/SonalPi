# Sonal — Contexte pour Claude

## Présentation

**Sonal** est une application desktop de recherche qualitative, construite avec **Electron**. Elle permet de gérer des corpus d'entretiens associant texte et audio, d'y appliquer une thématisation (codage qualitatif), des variables socio-démographiques, et d'exploiter le tout via des synthèses et exports.

- Version : 1.0.50
- Auteur : Alex Alber — sonalteam@gmail.com
- Dépôt : https://github.com/AlxAlbr/SonalPi
- Commande de lancement : `npm start` (Electron)
- Commande de build : `npm run build` (electron-builder)

---

## Architecture générale

```
main.js          → Processus principal Electron (IPC, fichiers, état global)
preload.js       → Bridge contextIsolation (window.electronAPI)
renderer.js      → Logique de la fenêtre principale
index.html       → Page principale
modules/         → Modules JS chargés via <script> (accès global dans le renderer)
```

### Autres pages HTML
| Fichier | Rôle |
|---|---|
| `ajout-entretien.html` | Fenêtre d'ajout d'entretien |
| `edition_entretien.html` | Édition d'un entretien |
| `edition_categories.html` | Gestion des thématiques/catégories |
| `nouveau_corpus.html` | Création d'un nouveau corpus |
| `saisie-gitlab.html` | Paramétrage GitLab |
| `saisie-url.html` | Saisie d'URL |
| `GitlabHelp.html` | Aide GitLab |

---

## État global (main.js)

L'état est centralisé dans le processus principal et exposé via `ipcMain.handle` :

| Variable | Type | Description |
|---|---|---|
| `Corpus` | Object | Infos du corpus ouvert (filePath, folder, fileName, type, content) |
| `tabThm` | Array | Thématiques/catégories de codage |
| `tabVar` | Array | Variables socio-démographiques |
| `tabDic` | Array | Dictionnaire des modalités des variables |
| `tabDat` | Array | Métadonnées (valeurs des variables par entretien) |
| `tabEnt` | Array | Liste des entretiens |
| `tabHtml` | Array | Contenus HTML des entretiens |
| `tabGrph` | Array | Représentations graphiques des entretiens |
| `ent_cur` | Number | Index de l'entretien courant (-1 = aucun) |

---

## Modules (`modules/`)

| Fichier | Rôle |
|---|---|
| `gestion_corpus.js` | Lecture/écriture des fichiers `.crp`, état local renderer |
| `gestion_entretiens.js` | Ajout, édition, suppression d'entretiens |
| `gestion_audio.js` | Lecture audio, waveform |
| `gestion_data.js` | Variables, dictionnaire, métadonnées |
| `gestion_fichiers.js` | Import de fichiers (TXT, DOCX, PDF) |
| `thematisation.js` | Codage thématique, styles CSS dynamiques, filigrane |
| `segmentation.js` | Découpage des segments d'entretien |
| `locutarisation.js` | Gestion des locuteurs |
| `conversions.js` | Utilitaires de conversion de formats |
| `utilitaires.js` | Fonctions utilitaires générales |
| `serveur_api.js` | Serveur HTTP local (API interne) |
| `gitlab_api.js` | Appels à l'API GitLab |
| `gitlab_oauth.js` | Authentification OAuth GitLab |
| `Synthèse.js` | Génération des synthèses |
| `waveform.worker.js` | Web Worker pour le rendu de waveform |
| `Anonymisation/` | Module d'anonymisation (tableau, import/export, aide) |

---

## Formats de fichiers

- **`.crp`** : Corpus Sonal (ZIP contenant JSON + fichiers associés)
- **`.sonal`** : Entretien Sonal (format propre)
- Import texte supporté : `.txt`, `.docx`, `.pdf`

---

## Communication IPC (main ↔ renderer)

Les modules renderer accèdent aux données via `window.electronAPI` (défini dans `preload.js`). Exemples :

```js
window.electronAPI.getCorpus()      // récupère l'objet Corpus
window.electronAPI.getThm()         // récupère tabThm
window.electronAPI.getEnt()         // récupère tabEnt
window.electronAPI.setTabLoc([])    // met à jour les locuteurs importés
```

Les modules sont **chargés comme `<script>` globaux** dans les pages HTML (pas de `require`/`import` dans le renderer).

---

## Conventions

- Le code est en **français** (variables, commentaires, UI)
- Les modules renderer sont dans un scope global (`window.*` ou variables globales déclarées avec `let`/`var` en tête de fichier)
- La persistance passe par le processus main (jamais de `fs` direct dans le renderer)
- Les sauvegardes sont des archives ZIP (AdmZip) contenant le JSON du corpus
