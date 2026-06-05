# Plan de refactorisation orientée objet — SonalPi

> Document de travail. Objectif : faire émerger progressivement les **objets implicites**
> identifiés dans [MODELE_OBJET3.md](MODELE_OBJET3.md) (Corpus, Entretien, Document/Segment/Fragment/Token,
> Variable/Modalité/Donnée, Catégorie + Extrait, RègleAnon + ContenuAnon, Commentaire, Recueil,
> couche Storage) **sans jamais casser l'application existante**.
>
> Ce plan décrit une stratégie *incrémentale et réversible*, pas une réécriture.

---

## ⏱️ État d'avancement (reprendre ici)

> Mis à jour au fil de l'eau. Pour reprendre sur une nouvelle machine, lire ce bloc puis la
> section de phase correspondante.

| Phase | État | Notes |
|---|---|---|
| **0** — Filets de sécurité (tests, golden, formats) | ✅ **Fait** | harnais `node:test`, golden masters, [docs/FORMATS.md](docs/FORMATS.md) |
| **Option B** — modules ES réels (`src/`) | ✅ **Fait** | `src/domain/*.mjs` (vrai code .crp/.sonal) testés sur le vrai corpus via jsdom ; cf. §2 |
| **1a** — couche `Storage` côté *main* | ✅ **Fait** | voir §4 |
| **1b tranche 1** — flux fichier *renderer* | ✅ **Fait, validé en local** | voir §4 |
| **1b tranche 2** — branches collaboratives *renderer* | ✅ **Fait** (à valider en GUI) | voir §4 |
| **2 tranche 1** — domaine EAV pur (`src/domain/eav.mjs`) | ✅ **Fait** | classes + vue calculée + logique de valeurs, testées en Node ; voir §5 |
| **2 tranche 2** — câblage `gestion_data.js` → domaine | ✅ **Fait, validé en local** | inventaireVariables/getMod/validMod/chgDic appellent `SonalDomain.eav` ; affichage entretien (gén. + locuteurs) OK après chargement du domaine dans `edition_entretien.html` ; voir §5 |
| **2 tranche 3** — câblage CRUD variables → domaine | ✅ **Fait (à valider en GUI)** | addVar/sauvVar/supprVar appellent `ajouter/modifier/supprimerVariable` + `retirerVariableDesDonnees` ; **Phase 2 complète** |
| **3 tranche 1** — agrégat `Entretien` pur (`src/domain/entretien.mjs`) | ✅ **Fait** | wrapper typé + accès EAV, testé en Node ; voir §6 |
| **3 tranche 2** — agrégat `Corpus` pur (`src/domain/corpus.mjs`) | ✅ **Fait** | possède `Entretien[]` + variables, getters `estLocal`/`estCollaboratif`, testé ; voir §6 |
| **3 tranche 3** — câblage renderer (en cours) | 🟡 **`collaboratif`+`type`+3 appelants lecture — validés en local** | getters `est*` + `Entretien` (varsPubliquesEnt/Xtr, voirEntretien). Distant/gitlab non testé. Reste : flux sauvegarde + churn métadonnées (faible valeur). recueil.js différé (post-Phase 5) |
| **4** → **6** | ⬜ à venir | |

**⚠️ Non encore vérifié : corpus DISTANT et GITLAB.** Toute la Phase 1 (1a + 1b) n'a été validée
qu'en **local**. Tester en priorité avant la Phase 2 (verrous, LFS, sync, chemins distants).
Sur `Corpus` : 2 concepts seulement — **`type`** (`'local'|'distant'|'gitlab'`, identité backend,
source de vérité) et **`collaboratif`** (capacité dérivée = multi-utilisateurs). Le renderer
utilise `collaboratif` pour le transverse ; `type` n'y subsiste que pour le **spécifique GitLab**
assumé. (La consolidation finale — `Corpus` classe avec getters — relève de la Phase 3.)

**Artefacts clés introduits** (pour s'orienter à froid) :
- Domaine ESM : [src/domain/corpus.mjs](src/domain/corpus.mjs), [src/domain/sonal.mjs](src/domain/sonal.mjs),
  exposés au renderer via [src/index.mjs](src/index.mjs) → `window.SonalDomain` (chargé par `<script type="module">` dans index.html).
- Couche Storage (main, CommonJS) : [modules/storage/](modules/storage/) =
  `Storage.js` (interface), `LocalStorage.js`, `ServeurStorage.js` (ex-`serveur_api.js`),
  `GitLabStorage.js` (ex-`gitlab_api.js`), `StorageFactory.js`.
- Tests : `test/*.test.mjs` (`npm test` / `npm run test:update`), fixtures **immuables** dans
  `test/fixtures/` (ne pas éditer en GUI). `TestInteropFromSonal/` = bac à sable libre.

**Prochaine action concrète** : **valider en GUI** la Phase 2 tranche 2 (édition de
modalités/valeurs sur un corpus), puis porter le CRUD variables (addVar/sauvVar/supprVar) sur le
domaine. Toujours en attente : valider Phase 1 en distant/gitlab.

---

## 0. Principes directeurs

1. **Non-régression d'abord.** Aucune phase ne change un comportement visible. Format `.crp`
   et `.sonal` strictement préservés (ce sont les données des utilisateurs).
2. **Strangler fig.** On encapsule un objet à la fois derrière une classe, *en gardant les
   `tabXxx` comme stockage interne au début*, puis on bascule les appelants un par un, et
   seulement à la fin on retire l'ancien chemin.
3. **Une seule source de vérité.** Le défaut central du code actuel est la double tenue
   « copie locale dans l'Entretien ↔ cache global au Corpus » (cf. `inventaireVariables`
   qui reconstruit `tabDat`, et le correctif défensif `gestion_entretiens.js:368`).
   **Origine** : les verrous **par fichier** (travail concurrent distant) — ce qui justifie une
   vérité *par entretien*, **pas** deux vérités co-égales (cf. MODELE_OBJET3 §3). **Résolution
   retenue** : valeurs (`tabDat`) maîtres dans le `.sonal`, définitions (`tabVar`/`tabDic`)
   maîtres dans le `.crp`. Chaque phase doit *réduire*, jamais aggraver, cette duplication.
4. **Trois altitudes séparées** (voir MODELE_OBJET3 §1 et §7) :
   domaine (Corpus, Entretien…) ↔ infrastructure (Storage) ↔ UI/DOM. On ne mélange pas.
5. **Petits pas livrables.** Chaque étape se termine sur une appli qui démarre et passe les
   tests de caractérisation. On peut s'arrêter entre deux phases sans dette ouverte.

---

## 1. Contraintes techniques (à traiter avant tout le reste)

Ces contraintes du code actuel conditionnent l'ordre des phases :

| Contrainte | Conséquence pour le plan |
|---|---|
| **Renderer = scripts globaux** (`modules/*.js` sans `import/export`, chargés en `<script>`, partage de `tabXxx`/`electronAPI` par le scope global) | Introduire des classes nécessite **d'abord** une stratégie de modules. Deux options en §2. |
| **Main = CommonJS** (`require`/`module.exports`), `ServeurAPI`/`GitLabAPI` déjà des classes | La couche Storage (§ Phase 1) peut démarrer *côté main* sans toucher au renderer. |
| **Aucun framework de test** (`scripts` = `start`/`build`) | Phase 0 obligatoire : monter un harnais de test. |
| **Couplage DOM fort** (segmentation, data, thématisation lisent/écrivent `document` directement) | Document/Segment/Mot sont les **derniers** à encapsuler (Phase 5). |
| **Persistance via store Electron** (`electronAPI.get*/set*`) | Ces couples `get/set` deviendront les `charger()/sauvegarder()` des classes. |

---

## 2. Décision préalable : stratégie de modules dans le renderer

À trancher en Phase 0, car tout en dépend. Deux options :

- **Option A — classes attachées au global** (`window.Corpus = class …`).
  *Pour* : zéro outillage, compatible avec le chargement `<script>` actuel.
  *Contre* : pas de vrai cloisonnement, pas d'`import` testable hors navigateur.
- **Option B — bundler léger (esbuild/Vite) + ES modules**.
  *Pour* : vrais modules, testables en Node, tree-shaking.
  *Contre* : ajoute une étape de build au renderer (aujourd'hui inexistante).

> Recommandation : **B à terme**, mais on peut démarrer en **A** pour les premières classes
> de domaine pur (Variable/Modalité/Donnée, sans DOM) et migrer vers B quand le besoin de
> tests unitaires renderer devient pressant. Le choix doit être acté avant la Phase 2.

> **✅ Décision actée (Phase 0)** : **démarrer en Option A** (classes globales `window.X`),
> **migrer vers Option B** (bundler ES modules) avant que les tests unitaires *renderer* ne
> deviennent nécessaires (vraisemblablement à l'amorce de la Phase 5, couplée au DOM). La
> couche Storage (Phase 1) et le domaine EAV (Phase 2) sont testés *en Node pur* sans dépendre
> de ce choix.
>
> **✅ Option B amorcée (ESM natif, sans bundler)** : on a finalement retenu de **vrais modules
> ES** dès maintenant, sans bundler — le renderer Electron charge `src/index.mjs` via
> `<script type="module">`, qui expose la couche domaine sur `window.SonalDomain` (pont
> **transitoire** vers le code legacy global, voué à disparaître à mesure que les modules legacy
> seront migrés — cf. Phase 5). Les modules `src/domain/*.mjs` sont importés tels quels par les
> tests Node (et `jsdom` fournit le DOM pour tester le vrai parsing `.sonal` : jsdom suffit ici
> car le parsing n'utilise que des APIs DOM de base — `innerHTML`, `querySelectorAll`,
> `closest`, `dataset` — fidèles entre jsdom et Electron). esbuild/Vite restent
> une option ultérieure si une étape de build devient utile. Premier seam livré : `parseCorpus`/
> `serializeCorpus` (`.crp`, adoptés par `lireCorpus`/`sauvegarderCorpus`) et `parseSonal`
> (`.sonal`, lecteur canonique que la Phase 5 adoptera).
>
> ⚠️ **Règle de portée fenêtre** : `window.SonalDomain` est posé par `src/index.mjs`, chargé
> **par fenêtre**. Toute `BrowserWindow` dont le HTML exécute du code legacy appelant le domaine
> **doit** inclure `<script type="module" src="src/index.mjs"></script>`. Concernées à ce jour :
> `index.html` **et** `edition_entretien.html` (la fenêtre entretien — oubli initial en Phase 2
> tranche 2, qui faisait planter `affichDataEnt` faute de `SonalDomain`). À revérifier dès qu'une
> nouvelle fenêtre consomme le domaine.

---

## 3. Phase 0 — Filets de sécurité (préalable) — ✅ **RÉALISÉE**

**But** : pouvoir refactorer sans peur.

- [x] **Tests de caractérisation (golden master)** sur les invariants observables :
  - [x] ouvrir un `.crp` de test → resérialiser → diff normalisé identique (`test/crp.test.js`) ;
  - [x] ouvrir un `.sonal`, parser segments/locuteurs/codages/anon → snapshot stable (`test/sonal.test.js`) ;
  - [ ] un export (docx/pdf/recueil) → snapshot. **Reporté** (binaires fragiles : zip/timestamps ;
        à traiter en extraction texte normalisée plus tard).
  - Jeux d'essai : `TestInteropFromSonal/`. ⚠️ `LauraFinMB/` **absent** du dépôt.
- [x] **Harnais** : runner natif `node:test`, scripts `npm test` / `npm run test:update`.
      Glob shell `test/*.test.mjs` → portable Node 18 **et** 24. Golden-file maison dans
      `test/helpers/golden.mjs`. Les tests exécutent le **vrai code** (`src/domain/*.mjs`) sur
      les fixtures immuables `test/fixtures/` (jsdom pour le `.sonal`). Dépendance ajoutée : `jsdom`.
- [x] **Décider la stratégie de modules** (§2) → Option **A** maintenant, **B** plus tard (cf. §2 ci-dessus).
- [x] **Geler les formats** : spec courte rédigée dans [docs/FORMATS.md](docs/FORMATS.md).

**Critère de sortie** : `npm test` vert ✅, l'appli démarre (aucun code de prod touché) ✅, formats documentés ✅.

---

## 4. Phase 1 — Couche `Storage` (infra, fort ROI, faible risque)

**Pourquoi en premier** : c'est la couche la plus mûre (deux classes parallèles existent déjà),
la moins couplée au métier et au DOM, et elle vit côté *main* (CommonJS, déjà modularisé).
Voir MODELE_OBJET3 §7.

> **Découpage retenu** : la Phase 1 a été scindée en **1a** (cœur côté *main*) et **1b**
> (renderer), elle-même en **tranche 1** (flux fichier) et **tranche 2** (collaboratif).

### 1a — Couche Storage côté *main* — ✅ **FAIT**
- [x] Interface `Storage` ([modules/storage/Storage.js](modules/storage/Storage.js)) :
  `lireFichier`, `ecrireFichier`, `verifierExistence`, `derniereModif`,
  `verrouiller/deverrouiller/rafraichirVerrou/verifierVerrou`, `listerFichiers`, `supprimerFichier`.
- [x] `ServeurAPI` → **`ServeurStorage`**, `GitLabAPI` → **`GitLabStorage`** (fichiers déplacés
  dans `modules/storage/`, `extends Storage`). `GitLabStorage.listerFichiers` rendu uniforme
  (tous les blobs `{name,path}`).
- [x] **`LocalStorage`** créé (wrappe `fs` + chardet/iconv ; verrous = no-op). Testé unitairement
  (`test/local-storage.test.mjs`).
- [x] **`StorageFactory.pour(corpus, {serveur, gitlab})`** (généralise `remoteAPI()`, inclut local).
- [x] Handlers IPC de flux fichier du *main* dé-branchés (helper unique `estCheminLocal`,
  `lister-recueils`/`supprimer-recueil`/`file:*` via `storagePour()`).
- Hors interface (appels directs sur l'instance GitLab) : LFS, file d'écriture par lots,
  `getMemberRole`, `lireOptions/ecrireOptions`, `_listerRecursif`, branches.

### 1b tranche 1 — Flux fichier côté *renderer* — ✅ **FAIT (validé local uniquement)**
Objectif : supprimer les branches `Corpus.type` qui (a) construisent un chemin (local absolu vs
distant relatif) et (b) choisissent le canal d'écriture.
- [x] Primitives *main* + preload : **`cheminCorpus(nom)`** (IPC `corpus:chemin`),
  **`cheminCorpusCrp()`** (IPC `corpus:cheminCrp`), **`ecrireFichier(chemin, content, opts)`**
  (IPC `corpus:ecrire`, route par **type de corpus** via `storagePour()` — pas par existence).
- [x] Drapeau **`Corpus.collaboratif`** posé à l'ouverture (local=false ; distant/gitlab=true),
  utilisé pour conserver le prompt d'écrasement **local uniquement**.
- [x] Migrés : `gestion_corpus.js:sauvegarderCorpus` (skip-if-unchanged uniformisé) ;
  `gestion_entretiens.js` (création/sauvegarde/lecture d'entretien, chemins d'image, waveform).
- ⚠️ **Corpus local validé en GUI ; distant/gitlab NON testés.**
- Détails/correctifs notables : routage `corpus:ecrire` par type (un fichier neuf n'existe pas
  encore) ; `estCheminLocal` → un corpus local ne route **jamais** vers le distant ; garde
  `entWindow.isDestroyed()` dans `ouvrirAjoutEntretien` (crash main à l'import).

### 1b tranche 2 — Branches collaboratives côté *renderer* — ✅ **FAIT (à valider en GUI)**
Un seul drapeau **dérivé** posé à l'ouverture (main.js) : **`Corpus.collaboratif`**
(= `type !== 'local'`). `Corpus.type` reste la source de vérité (pas de champ `backend` :
ce serait un doublon de `type`).
- **Transverse → `Corpus.collaboratif`** (vraies fonctions multi-utilisateurs) :
  bouton rafraîchir [gestion_corpus.js:197](modules/gestion_corpus.js#L197), verrou avant
  ouverture [gestion_entretiens.js:586](modules/gestion_entretiens.js#L586), verrou avant
  édition de donnée [gestion_data.js:1376](modules/gestion_data.js#L1376), garde de la veille
  [index.html:722](index.html#L722), orchestration *main* (≈ main.js 975/1239/1334/1358).
- **Spécifique-backend assumé → `Corpus.type === 'gitlab'`** (légitime, comme la couche Storage
  garde le LFS hors interface) : re-sync GitLab [gestion_corpus.js:985](modules/gestion_corpus.js#L985),
  refresh serveur `:1119` (`type !== 'distant'`), sync périodique [index.html:747](index.html#L747),
  restriction d'ajout GitLab [gestion_entretiens.js:24](modules/gestion_entretiens.js#L24), menu
  « Paramètres GitLab » (main.js ≈2865).
- Hors scope (inchangé) : heuristiques de dossier par défaut des dialogues d'export dans main.js
  (`Corpus.type !== 'distant'`) ; blocs commentés `gestion_entretiens.js:57` et `:1301`.

**Critère de sortie (Phase 1 complète)** : ✅ plus aucun `Corpus.type` **transverse** dans le
renderer (seul subsiste le spécifique-GitLab assumé) ; `npm test` 14/14 (Node 18+24). **Reste à
valider en GUI distant/gitlab.** Ajouter Nextcloud (WebDAV) = une classe Storage + `collaboratif`.

---

## 5. Phase 2 — Modèle de données EAV (`Variable` / `Modalité` / `Donnée`)

**Pourquoi ici** : domaine pur, **sans DOM**, donc testable unitairement tout de suite ;
et c'est le siège de la duplication la plus douloureuse.

> **✅ Tranche 1 faite (domaine pur + tests)** : [src/domain/eav.mjs](src/domain/eav.mjs) —
> classes `Variable`/`Modalite`/`Donnee` (noms explicites, `fromJSON`/`toJSON` vers les clés
> gelées `v`/`lib`/`champ`/`priv`/`m`/`e`/`l`), **vue calculée** `unionDonnees` (union des `tabDat`
> locaux — officialise ce que `inventaireVariables` reconstruisait à la main), `inventorierVariables`,
> et la logique de valeurs sans DOM/IO (`lireValeur`/`definirValeur`/`renommerModalite`,
> `ajouter`/`modifier`/`supprimerVariable`). Exposé sur `window.SonalDomain.eav`. Tests :
> [test/eav.test.mjs](test/eav.test.mjs) (golden de la vue calculée + équivalence stricte au
> rebuild legacy).
>
> **✅ Tranche 2 faite (câblage renderer, à valider en GUI)** : [gestion_data.js](modules/gestion_data.js)
> délègue désormais au domaine — `inventaireVariables` → `unionDonnees` + `inventorierVariables`
> (le `tabDat` corpus n'est **plus** reconstruit à la main : critère de sortie atteint),
> `getMod` → `lireValeur`, `validMod` → `definirValeur`, `chgDic` → `renommerModalite`. Le rendu
> (`affichDataGen`/`affichDataEnt`) et la persistance (`electronAPI`, `majFichierSonal`) restent
> côté renderer. Deux affinements de comportement assumés : (a) `inventaireVariables` ne pollue
> plus `tabVar` avec le marqueur mort `nvcode` ; (b) `validMod` ne crée plus de modalité orpheline
> si l'entretien est introuvable (cas qui ne survient pas en pratique). **Reste hors tranche** :
> le CRUD de variables (`addVar`/`sauvVar`/`supprVar`), très couplé au DOM (formulaire + modalités),
> dont la logique pure existe déjà dans le domaine (`ajouter`/`modifier`/`supprimerVariable`).
>
> **✅ Tranche 3 faite (CRUD variables, à valider en GUI)** : `addVar` (création) →
> `ajouterVariable` (variable + modalité 0), `sauvVar` → `modifierVariable`, `supprVar` →
> `supprimerVariable` + `retirerVariableDesDonnees` (cascade sur les `tabDat` locaux et la vue
> corpus). Le DOM (formulaire, modalités), le repositionnement et la persistance restent côté
> renderer. `editVar` reste purement UI (peuple la boîte de dialogue, délègue à `sauvVar`).
> **Phase 2 complète** : toute la logique EAV listée au §5 est encapsulée dans
> [src/domain/eav.mjs](src/domain/eav.mjs).

- Classes `Variable {v, lib, champ, priv}`, `Modalite {v, m, lib}`, `Donnee {e, v, l, m}`.
  ⚠️ **Pas** deux conteneurs « BaseDeDonnéesEntretien / Corpus » (ça graverait l'accident dans
  le marbre, cf. MODELE_OBJET3 §3) — soit des méthodes sur les agrégats, soit un service unique.
- Renommer les méthodes et propriétés avec des noms courts mais explicites, ne pas utiliser de noms abréviés
- **Établir la source de vérité unique**, partagée selon la *nature* de la donnée (cf. MODELE_OBJET3 §3) :
  - **valeurs** (`Donnee`/`tabDat`, rattachées à un entretien `e`) → maîtres dans le **`.sonal`** ;
    le `tabDat` corpus devient une **vue calculée** (l'*union* des locaux), jamais un cache resynchronisé à la main ;
  - **définitions** (`Variable`/`Modalite` = `tabVar`/`tabDic`, transverses) → maîtres dans le **`.crp`**.
  La granularité ainsi obtenue est exactement **celle des verrous par fichier** (concurrence distante).
- Encapsuler la logique aujourd'hui éparpillée dans `gestion_data.js` :
  `addVar/editVar/sauvVar/supprVar`, `getMod/validMod/chgDic`, `inventaireVariables`
  → méthodes des classes, **logique séparée du rendu** (`affichDataGen`/`affichDataEnt`
  restent côté UI mais appellent le modèle).

**Critère de sortie** : `inventaireVariables` n'a plus besoin de « reconstruire » le tabDat
global ; tests unitaires sur les valeurs sans DOM.

---

## 6. Phase 3 — Agrégats `Entretien` et `Corpus`

**But** : transformer les sacs de propriétés `tabEnt[i]` et l'objet global `Corpus` en
vraies entités qui *possèdent* leurs sous-objets.

> **⚠️ Décision d'architecture (prise en démarrant la Phase 3).** Constat : l'état canonique
> (`Corpus` meta, `tabEnt`, `tabVar/Dic/Dat`) vit dans le **process main** (main.js, globaux +
> store), `StorageFactory` et l'I/O aussi ; le renderer n'obtient que des **snapshots via IPC** et
> *orchestre* l'ouverture/sauvegarde. La douleur (`tabEnt[i].xxx` éparpillés, `Corpus` global
> trifouillé) est **renderer-side**. **Décision** :
> - `Corpus`/`Entretien` = **domaine pur ESM dans `src/domain/`** (aucun Electron/IPC/fs/DOM),
>   calqué sur `eav.mjs` : on enveloppe les snapshots (`fromJSON`/`toJSON` sans perte), on opère,
>   on repousse via `set-*`. Le **main reste l'unique source de vérité** (pas de second état vivant).
> - **Déviation assumée du plan sur `StorageFactory`** : il **reste dans le main** comme sélecteur
>   de backend derrière l'IPC (pas de `Corpus.storage()` tenant une instance `Storage` dans le
>   renderer — impossible proprement). Ce qui migre dans `Corpus`, c'est la partie **pure** : les
>   getters dérivés `estLocal`/`estCollaboratif`. `Corpus.ouvrir/sauvegarder` (renderer) orchestrent
>   et délèguent l'I/O à l'IPC (qui, lui, utilise `StorageFactory`).
> - Bénéfice : zéro pont ESM→CommonJS dans le main, cohérent avec `src/domain`, testable en Node.
>
> **✅ Tranche 1 faite** : [src/domain/entretien.mjs](src/domain/entretien.mjs) — wrapper typé pur
> sur le snapshot entretien (accesseurs explicites `identifiant`/`nom`/`fichierSonal`/`locuteurs`…,
> `donnees()`/`variables()`/`modalites()` réutilisant `eav`), `fromJSON`/`toJSON` sans perte.
> Exposé sur `window.SonalDomain.Entretien`. Tests : [test/entretien.test.mjs](test/entretien.test.mjs).
> Les méthodes I/O (charger/sauvegarderSonal, exports, verrou) restent à l'orchestration et seront
> branchées plus tard.
>
> **✅ Tranche 2 faite** : agrégat racine `Corpus` dans [src/domain/corpus.mjs](src/domain/corpus.mjs)
> (aux côtés de `parseCorpus`/`serializeCorpus`). Possède `Entretien[]` + variables/modalités ;
> `Corpus.fromParts({corpus, tabEnt, tabVar, tabDic})` assemble depuis les snapshots IPC ; getters
> dérivés `estLocal`/`estCollaboratif`/`estGitlab` (depuis `type`, source de vérité), méta
> (`dossier`/`nomFichier`/`url`), `entretiens()`/`entretienParId(id)`/`variables()`/`modalites()`,
> `donnees()` (= `eav.unionDonnees`), et `toEntretiens()`/`toVariables()`/`toModalites()` pour
> repousser via `set-*`. Exposé sur `window.SonalDomain.Corpus`. Tests :
> [test/corpus-aggregat.test.mjs](test/corpus-aggregat.test.mjs).
> **Tranche 3 (en cours)** : remplacer les accès épars du renderer par l'API objet, un appelant à
> la fois (strangler).
> - **✅ Sous-étape `collaboratif`** : les 5 lectures transverses `Corpus.collaboratif` du renderer
>   ([gestion_corpus.js:197](modules/gestion_corpus.js#L197), [gestion_entretiens.js:149](modules/gestion_entretiens.js#L149)
>   & [:586](modules/gestion_entretiens.js#L586), [gestion_data.js:1268](modules/gestion_data.js#L1268),
>   [index.html:722](index.html#L722)) passent par `window.SonalDomain.Corpus.fromParts({corpus}).estCollaboratif`
>   (dérivé de `type`, source de vérité). Sémantique préservée (`collaboratif === type !== 'local'`).
>   ⚠️ Le champ persisté `collaboratif` reste **lu par le main** (main.js ≈456, hors agrégat
>   renderer) ; sa suppression complète relèvera d'une consolidation main ultérieure. **À valider
>   en GUI distant/gitlab** (bouton rafraîchir, verrous, veille, prompt d'écrasement).
> - **✅ Sous-étape `type` (spécifique-backend)** : ajout du getter `estDistant` ; les lectures
>   vivantes `Corpus.type` du renderer passent par les getters — restriction d'ajout GitLab
>   ([gestion_entretiens.js:24](modules/gestion_entretiens.js#L24) → `estGitlab`), re-sync GitLab
>   ([gestion_corpus.js:986](modules/gestion_corpus.js#L986) → `estGitlab`) et refresh serveur
>   ([gestion_corpus.js:1120](modules/gestion_corpus.js#L1120) : `type!=='distant'` → `!estDistant`),
>   sync périodique GitLab ([index.html:748](index.html#L748) → `estGitlab`). Les deux `Corpus.type`
>   restants en gestion_entretiens.js (≈58, ≈1303) sont dans des **blocs commentés** (intacts).
>   **recueil.js NON migré** : le plan (§7) le diffère après la Phase 5 (le Recueil dépend du Document).
> - **🟡 Sous-étape `tabEnt[i].xxx` (lectures, option A — validée en local)** : 3 appelants
>   lecture seule migrés vers l'API `Entretien` — [varsPubliquesXtr](modules/gestion_data.js#L1450),
>   [varsPubliquesEnt](modules/gestion_data.js#L1392) (`tabDat`→`donnees()`, `tabLoc[i]`→`nomLocuteur`),
>   [voirEntretien](modules/gestion_corpus.js#L1403) (`tabLoc`→`locuteurs`, `nom`). Validé GUI local
>   (smoke + écrasement local + ouverture entretien + variables publiques + synthèse). Distant/gitlab
>   non testé. **Choix de portée** : on ne migre PAS (a) les lectures `.tabLoc` testées en truthiness
>   (ex. gestion_data.js:698 `if(!locut)` — `locuteurs` renverrait `[]` et casserait la branche),
>   (b) les métadonnées nues (`.nom`/`.notes`/`.id` : getter de même nom = churn sans valeur).
> - **À suivre (optionnel, plus risqué)** : flux de sauvegarde de `gestion_entretiens.js` (lectures
>   `tabLoc`/`tabDat`/`notes`/`tabAnon` passées à `sauvHtml`) → API `Entretien`. Les **écritures**
>   `tabEnt[i]` (ex. `cleanVariables`, `ent.tabDat=…`) relèveraient de l'option B (méthodes de
>   mutation) — non décidée. La cible stricte « tout passe par Corpus/Entretien » (critère §6) reste
>   un objectif de nettoyage Phase 6.

- `Entretien` : `id, nom, rtrPath, audioPath, imgPath, notes`, possède `Locuteur[]`,
  `Donnee[]`, `RegleAnon[]`, et **un** `Document`. Méthodes : `charger/sauvegarderSonal`,
  `convertRtrToSonal`, exports, verrou (délègue à `Storage`).
- `Corpus` : agrégat racine, possède `Entretien[]`, le codebook, les variables ;
  méthodes `ouvrir/sauvegarder` (délèguent à `StorageFactory`).
- Remplacer les accès directs `tabEnt[i].xxx` des appelants par l'API d'objet, un appelant
  à la fois (strangler).
- **Absorption de `StorageFactory` (issu de Phase 1a)** : la *sélection* du backend (« quel
  Storage pour ce corpus ? ») a vocation à devenir une méthode de l'agrégat, ex. `Corpus.storage()`,
  et les drapeaux dérivés (`collaboratif`) des **getters** de `Corpus` (`estLocal`, `estCollaboratif`).
  `StorageFactory.js` — couche de pont volontairement mince — disparaîtra alors au profit de `Corpus`.

**Critère de sortie** : ouverture/sauvegarde de corpus passe par `Corpus`/`Entretien` ;
les `tabEnt`/`Corpus` globaux ne sont plus manipulés en direct hors de ces classes.

---

## 7. Phase 4 — Codebook (`Catégorie`) et `RègleAnon`

- `Categorie {code, nom, couleur, taille, rang, cmpct, act}` + conteneur `Codebook`
  (hiérarchie via `rang`, compactage). Encapsule `thematisation.js`.
  `Extrait` (dérivé, **non stocké** : plage continue d'une catégorie, peut enjamber les segments,
  cf. MODELE_OBJET3 §4) = **read-model** reconstruit à la lecture, pas une entité à persister.
- `RegleAnon` (instruction) **et** `ContenuAnon` (matérialisation `anon`/`anon-exception` + `data-pseudo`,
  cf. MODELE_OBJET3 §5) + service d'anonymisation. Encapsule `modules/Anonymisation/*`.
  Rappel : règles = *instructions* ; l'anonymisation effective vit dans les `span.anon` du Document
  → la partie **application dépend du Document** (Phase 5). **Invariant à préserver** : l'asymétrie à
  3 états (anonymisé / exception / présent-non-anonymisé, ce dernier *sans* `ContenuAnon`).

**Critère de sortie** : codebook, règles **et** matérialisations (`ContenuAnon`) manipulés via objets ;
`Extrait` calculé à la lecture ; rendu DOM séparé de la logique.

> **Recueil & Synthèse (lecture/restitution).** Consommateurs d'`Extrait` : la Synthèse les
> regroupe/filtre ; le **Recueil** les *collecte* en items
> `ItemRecueil {rang, type, rgdep, rgfin, texte, commentaire}` ([recueil.js](modules/recueil.js)).
> À encapsuler **après** la Phase 5 (dépendent du Document/Fragment). ⚠️ Le `commentaire` d'un item de
> Recueil ≠ le `Commentaire` posé sur le texte (Phase 5) — homonyme à garder distinct.

---

## 8. Phase 5 — `Document` / `Segment` / `Fragment` (le plus couplé au DOM)

> **▶ Première tranche prévue (reportée de la Phase 3) : sérialisation `.sonal` dans le domaine.**
> En Phase 3 (tranche 3), on a constaté que le flux de sauvegarde de `gestion_entretiens.js` n'était
> pas migrable « en lecture » : `sauvHtml(...)` exige des **tableaux bruts** (`Entretien.donnees()`
> renvoie des instances → corromprait le `.sonal`), et envelopper `ent` casse les accès bruts voisins.
> La bonne forme (option B) est d'**extraire `sauvHtml`** ([gestion_fichiers.js:796](modules/gestion_fichiers.js#L796),
> **sans DOM** — assemblage de chaîne, miroir de `parseSonal` ; seule dépendance : le global `tabThm`
> via `exportThmcss`, à passer en argument) vers **`src/domain/sonal.mjs` (`serializeSonal`, pur)**,
> puis exposer **`Entretien.serialiserSonal({ html, tabThm, tabVar, tabDic })`**. Bénéfices : le site
> de sauvegarde se contracte (fini les 8 args positionnels), et surtout on gagne un **golden de
> sérialisation + round-trip `parse(serialize(x)) ≈ x`** — un filet de test qui MANQUE aujourd'hui
> sur la sauvegarde. À faire **avant** de toucher `Document`/`Segment`, et à **valider en GUI (local
> ET distant/gitlab)** car c'est du code de sauvegarde (risque de perte de données). Les écritures
> `ent.xxx =` (mutations : `renommer`/`definirNotes`/`definirLocuteurs`…) sont de moindre priorité —
> l'essentiel des écritures `tabDat` passe déjà par la logique EAV (Phase 2).

**Pourquoi en dernier** : c'est le cœur du couplage au `document` (innerHTML de `#segments`,
spans `.lblseg`, undo/redo par snapshot HTML). Le plus risqué.

- `Document` : encapsule le HTML du `.sonal`, expose `segments`, `reinitRk`, `undo/redo`.
- `Segment {rksg, deb, fin, loc, statut, nomloc}` possède `Fragment[]`.
  **`Fragment {rk, len, sg, codes}`** = *run de tokens consécutifs au même formatage* (ex-« Mot » :
  ce n'est **pas** un mot, cf. MODELE_OBJET3 §2). Le **`Token`** (le vrai atome, désigné par `rk`)
  reste **sans objet** — un rang jamais matérialisé en HTML.
- Les marquages inline sont **3 calques orthogonaux** sur les fragments (codage `cat_xxx` /
  anon `data-pseudo` / commentaire `data-obs`) : un fragment en porte n'importe quelle combinaison ;
  ce ne sont ni des sous-types ni des attributs scalaires (cf. MODELE_OBJET3 §2).
- **`Commentaire {auteur, texte, rkDebut, rkFin}`** (`obs`/`obsfin` + `data-obs`/`data-auth`/`data-finobs`) :
  annotation **persistée dans le `.sonal`**, autonome (aucune règle au-dessus). À **préserver** lors de
  l'encapsulation — la compaction la conserve et elle force une coupure de fragment. Encapsule aussi les
  commentaires de `edition_entretien.html`.
- Étape clé : **isoler une couche d'accès** entre la logique de segmentation/codage et le DOM
  (un « DocumentView » qui lit/écrit les spans), pour que `Segment`/`Fragment` deviennent
  manipulables sans dépendre directement de `document`.
- Encapsule `segmentation.js`.

**Critère de sortie** : la logique de segmentation/codage est testable sur un Document en
mémoire ; le DOM n'est touché que par la couche de vue.

---

## 9. Phase 6 — Nettoyage UI et fin du strangler

- Retirer les anciens chemins (`tabXxx` globaux résiduels, fonctions doublées).
- Séparer nettement, dans chaque module d'affichage, le **rendu** (DOM) de la **logique**
  (déjà déplacée dans les classes).
- Mettre à jour MODELE_OBJET3.md si le modèle a divergé en route.

---

## 10. Ordre, dépendances et risques

```
Phase 0 (tests + modules)  ──►  prérequis de tout
Phase 1 (Storage)          ──►  indépendant, côté main, faible risque   ← commencer ici
Phase 2 (EAV données)      ──►  domaine pur, sans DOM, testable
Phase 3 (Entretien/Corpus) ──►  s'appuie sur 1 (storage) et 2 (données)
Phase 4 (Codebook/Anon)    ──►  partie Anon dépend de 5
Phase 5 (Document/Seg/Fragment) ─►  le plus risqué, isolé volontairement à la fin
Phase 6 (nettoyage)        ──►  clôture
```

**Risques transverses**
- *Régression de format* `.crp`/`.sonal` → mitigé par les golden masters (Phase 0).
- *Double source de vérité* persistante si on bâcle la Phase 2 → traiter à fond avant la 3.
- *Couplage DOM* sous-estimé en Phase 5 → prévoir la couche de vue dès le début de la phase.
- *Corpus distants* : tester verrouillage/concurrence à chaque phase touchant la sauvegarde.

**Règle d'or** : à la fin de *chaque* étape, l'appli démarre (`npm start`) et `npm test` est vert.
Si ce n'est pas le cas, on ne passe pas à l'étape suivante.
