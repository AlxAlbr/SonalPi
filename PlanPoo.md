# Plan de refactorisation orientée objet — SonalPi

> Document de travail. Objectif : faire émerger progressivement les **objets implicites**
> identifiés dans [MODELE_OBJET3.md](MODELE_OBJET3.md) (Corpus, Entretien, Document/Segment/Fragment/Token,
> Variable/Modalité/Donnée, Catégorie + Extrait, RègleAnon + ContenuAnon, Commentaire, Recueil,
> couche Storage) **sans jamais casser l'application existante**.
>
> Ce plan décrit une stratégie *incrémentale et réversible*, pas une réécriture.

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
> `<script type="module">`, qui expose la couche domaine sur `window.SonalDomain` (pont vers le
> code legacy global). Les modules `src/domain/*.mjs` sont importés tels quels par les tests
> Node (et `jsdom` fournit le DOM pour tester le vrai parsing `.sonal`). esbuild/Vite restent
> une option ultérieure si une étape de build devient utile. Premier seam livré : `parseCorpus`/
> `serializeCorpus` (`.crp`, adoptés par `lireCorpus`/`sauvegarderCorpus`) et `parseSonal`
> (`.sonal`, lecteur canonique que la Phase 5 adoptera).

---

## 3. Phase 0 — Filets de sécurité (préalable) — ✅ **RÉALISÉE**

**But** : pouvoir refactorer sans peur.

- [x] **Tests de caractérisation (golden master)** sur les invariants observables :
  - [x] ouvrir un `.crp` de test → resérialiser → diff normalisé identique (`test/crp.test.js`) ;
  - [x] ouvrir un `.sonal`, parser segments/locuteurs/codages/anon → snapshot stable (`test/sonal.test.js`) ;
  - [ ] un export (docx/pdf/recueil) → snapshot. **Reporté** (binaires fragiles : zip/timestamps ;
        à traiter en extraction texte normalisée plus tard).
  - Jeux d'essai : `TestInteropFromSonal/`. ⚠️ `LauraFinMB/` **absent** du dépôt.
- [x] **Harnais** : runner natif `node:test` (zéro dépendance), scripts `npm test` /
      `npm run test:update`. Glob shell `test/*.test.js` → portable Node 18 **et** 24.
      Golden-file maison dans `test/helpers/golden.js`.
- [x] **Décider la stratégie de modules** (§2) → Option **A** maintenant, **B** plus tard (cf. §2 ci-dessus).
- [x] **Geler les formats** : spec courte rédigée dans [docs/FORMATS.md](docs/FORMATS.md).

**Critère de sortie** : `npm test` vert ✅, l'appli démarre (aucun code de prod touché) ✅, formats documentés ✅.

---

## 4. Phase 1 — Couche `Storage` (infra, fort ROI, faible risque)

**Pourquoi en premier** : c'est la couche la plus mûre (deux classes parallèles existent déjà),
la moins couplée au métier et au DOM, et elle vit côté *main* (CommonJS, déjà modularisé).
Voir MODELE_OBJET3 §7.

- Définir l'**interface `Storage`** (le plus petit dénominateur commun) :
  `lireFichier`, `ecrireFichier`, `verifierExistence`, `derniereModif`,
  `verrouiller`/`deverrouiller`/`rafraichirVerrou`/`verifierVerrou`,
  `listerFichiers`, `supprimerFichier`.
- **Renommer** `ServeurAPI` → `ServeurStorage`, `GitLabAPI` → `GitLabStorage` (interface conforme).
- **Créer `LocalStorage`** (le morceau manquant) : wrappe `fs`, verrous = no-op.
- **Généraliser `remoteAPI()`** → `StorageFactory.pour(Corpus)`, *incluant local*.
- **Supprimer les ~25 branchements `if (Corpus.type === …)`** côté renderer ET main :
  tout passe par `storage.xxx()`.
- Garder **hors interface** les spécificités GitLab (LFS, file d'écriture par lots,
  `getMemberRole`, branches, `.gitattributes`).

**Critère de sortie** : plus aucun `Corpus.type ===` dans le code de flux fichier ;
local/distant/gitlab fonctionnent à l'identique ; ajouter Nextcloud (WebDAV) = une seule classe.

---

## 5. Phase 2 — Modèle de données EAV (`Variable` / `Modalité` / `Donnée`)

**Pourquoi ici** : domaine pur, **sans DOM**, donc testable unitairement tout de suite ;
et c'est le siège de la duplication la plus douloureuse.

- Classes `Variable {v, lib, champ, priv}`, `Modalite {v, m, lib}`, `Donnee {e, v, l, m}`.
  ⚠️ **Pas** deux conteneurs « BaseDeDonnéesEntretien / Corpus » (ça graverait l'accident dans
  le marbre, cf. MODELE_OBJET3 §3) — soit des méthodes sur les agrégats, soit un service unique.
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

- `Entretien` : `id, nom, rtrPath, audioPath, imgPath, notes`, possède `Locuteur[]`,
  `Donnee[]`, `RegleAnon[]`, et **un** `Document`. Méthodes : `charger/sauvegarderSonal`,
  `convertRtrToSonal`, exports, verrou (délègue à `Storage`).
- `Corpus` : agrégat racine, possède `Entretien[]`, le codebook, les variables ;
  méthodes `ouvrir/sauvegarder` (délèguent à `StorageFactory`).
- Remplacer les accès directs `tabEnt[i].xxx` des appelants par l'API d'objet, un appelant
  à la fois (strangler).

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
