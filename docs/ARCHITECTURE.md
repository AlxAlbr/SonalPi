# Architecture de SonalPi

> **À lire en premier** si tu arrives sur le projet. Ce document décrit l'organisation *réelle* du
> code et comment les pièces communiquent. Pour le *pourquoi* et l'historique du refactoring, voir
> [PlanPoo.md](../plans/PlanPoo.md) ; pour le modèle conceptuel des objets, [MODELE_OBJET.md](MODELE_OBJET.md) ;
> pour les formats de fichiers, [docs/FORMATS.md](FORMATS.md).

## En une phrase

SonalPi est une app **Electron** d'analyse d'entretiens : un process **main** (Node) détient l'état
et fait l'I/O ; des fenêtres **renderer** affichent et éditent ; la **logique métier** est isolée
dans des modules **purs et testés** sous `domain/`.

---

## Les 3 altitudes (le principe organisateur)

Le code se lit par **altitude**, pas par fichier. Les trois niveaux existent déjà — voici où ils vivent
*physiquement* aujourd'hui (la structure est historique, d'où ce document) :

| Altitude | Rôle | Où c'est |
|---|---|---|
| **Domaine** | logique métier pure (Corpus, Entretien, Variable/Modalité/Donnée, Catégorie, RègleAnon, Document/Segment/Fragment…). Aucun DOM, IPC, fs. | **`domain/*.mjs`** (ESM) |
| **Infrastructure** | persistance & I/O : lire/écrire fichiers, verrous, backends (local / serveur / GitLab). | **`storage/*.js`** + **`main.js`** (CommonJS, process *main*) |
| **UX / Vue** | rendu DOM, interactions, fenêtres. | **`modules/*.js`** (scripts globaux) + **`*.html`** |

> **Règle de dépendance** : le **domaine ne dépend de rien** (ni DOM, ni Electron). La **vue** appelle
> le domaine ; l'**infra** est isolée côté *main*. C'est ce cloisonnement — pas les dossiers — qui
> définit les altitudes.

---

## Les deux ponts (comment ça communique)

```
   ┌─────────────────────────── process MAIN (Node, CommonJS) ───────────────────────────┐
   │  main.js  ── détient l'état canonique (Corpus, tabEnt, tabVar/Dic/Dat/Thm)           │
   │           ── orchestre l'I/O via  storage/ (Storage + StorageFactory)               │
   └───────────────────────────────────────────────┬─────────────────────────────────────┘
                              IPC  ▲  electronAPI  │  (preload.js, contextBridge)
                  get-* / set-* / corpus:* / file:* │  ▼
   ┌───────────────────────────────────────────────┴─────────── fenêtres RENDERER ────────┐
   │  *.html  +  modules/*.js (scripts globaux : gestion_*, segmentation, thematisation…)  │
   │     │                                                                                  │
   │     └── window.SonalDomain  ◄── domain/index.mjs  ◄── domain/*.mjs  (ESM pur)        │
   └───────────────────────────────────────────────────────────────────────────────────────┘
```

1. **`electronAPI` (pont main ↔ renderer)** — exposé par [preload.js](../preload.js) (`contextBridge`).
   Le renderer appelle `window.electronAPI.getEnt()/setEnt()/…` ; le main répond via ses handlers IPC.
2. **`window.SonalDomain` (pont legacy ↔ domaine)** — posé par [domain/index.mjs](../domain/index.mjs),
   chargé en `<script type="module">` dans `index.html` **et** `edition_entretien.html`. Il expose
   le domaine ESM aux scripts globaux (qui ne sont pas des modules). ⚠️ **Toute fenêtre dont les
   scripts appellent le domaine doit charger `domain/index.mjs`** (oubli classique → `SonalDomain undefined`).

> `window.SonalDomain` est un **pont transitoire** : il existe tant que la vue est en scripts globaux.

---

## Le modèle de données à l'exécution (important)

L'**état canonique vit dans le process main** (globaux + `electron-store`). Le renderer n'en a que des
**snapshots** : il **tire** (`getEnt`…), **enveloppe** dans un objet domaine, **opère**, puis
**repousse** (`setEnt`…).

```
renderer:  const corpus = SonalDomain.Corpus.fromParts({ corpus, tabEnt, tabVar, tabDic });
           … corpus.estCollaboratif, ent.donnees(), metadonnees.definirValeur(...) …
           await electronAPI.setEnt(corpus.toEntretiens());   // repousse vers le main
```

Donc les classes de `domain` sont des **wrappers de lecture + logique pure**, pas des objets
vivants détenteurs de l'état. C'est un **choix assumé** (cf. PlanPoo §6).

### Coexistence assumée des deux patterns IPC (et pourquoi on s'arrête là)

Deux styles d'IPC d'écriture **coexistent volontairement**, et ce n'est **pas un état transitoire** à
résorber — c'est un point d'arrêt délibéré.

- **EAV (variables / modalités / valeurs) → commandes.** Le cycle pull-mutate-push a été remplacé par
  des **commandes** (`corpus:ajouterVariable`, `corpus:modifierVariable`, `corpus:supprimerVariable`,
  `entretien:definirValeur`, `corpus:renommerModalite`) qui exécutent le domaine côté **main** et
  renvoient directement les tranches modifiées (`{ ok, tabVar, tabDic, … }`). Le renderer les utilise
  sans re-pull séparé.
- **Tout le reste (`tabEnt`, `tabThm`, `Corpus` méta…) → get/set legacy.** Cycle pull-mutate-push
  inchangé.

**Pourquoi l'EAV et pas le reste ?** Parce que l'EAV était le seul bloc *bon marché* à migrer : ses
fonctions de commande (`ajouterVariable`, `definirValeur`…) **existaient déjà** dans
[metadonnees.mjs](../domain/metadonnees.mjs) depuis le refactoring d'étape 1 (PlanPoo). La migration
n'a donc été que du *câblage*. Les blocs suivants n'ont **pas** ces fonctions :
[entretien.mjs](../domain/entretien.mjs), [codebook.mjs](../domain/codebook.mjs) et
[anonymisation.mjs](../domain/anonymisation.mjs) n'exposent que des classes — il faudrait *écrire* la
logique de commande. Et le candidat le plus naturel (l'ajout d'entretien) est surtout de l'**I/O et de
la conversion de format**, pas de la logique pure : peu adapté au modèle commande.

**Pourquoi c'est volontaire (et non « pas fini ») ?** La motivation phare de cette évolution
(cf. [PlanPoo2.md](../plans/PlanPoo2.md)) était la **synchro multi-fenêtres gratuite** via événements. Or les
vues de cette app **s'excluent mutuellement** (ouvrir l'une ferme les autres) : il n'y a jamais deux
copies vivantes du modèle à synchroniser. Le bénéfice phare est donc **sans objet ici**. La vraie
valeur — un domaine pur, isolé et testé — **a déjà été capturée par l'étape 1** ; les commandes ne
font que déplacer *où* ce domaine s'exécute. Migrer le reste coûterait cher (écrire du domaine neuf
pour des opérations I/O-lourdes) pour un gain quasi nul. **Décision : l'EAV reste un pilote démontré,
le reste reste sur get/set, et l'architecture hybride est le point d'équilibre assumé.**

**Source de vérité par donnée** (cf. MODELE_OBJET §3) : les **valeurs** (`tabDat`) sont maîtres dans
le **`.sonal`** de chaque entretien ; les **définitions** (`tabVar`/`tabDic`) et le codebook
(`tabThm`) dans le **`.crp`**. Le `tabDat` au niveau corpus est une **vue calculée** (union des locaux).

---

## Carte des dossiers

```
domain/                  LE métier, pur & testé (ESM) :
  index.mjs              Pont : importe les modules, pose window.SonalDomain
  metadonnees.mjs        Variable / Modalite / Donnee + logique EAV (ex-"eav")
  corpus.mjs             parse/serializeCorpus (.crp) + agrégat Corpus
  entretien.mjs          Entretien (+ serialiserSonal)
  codebook.mjs           Categorie / Codebook (hiérarchie des catégories)
  anonymisation.mjs      RegleAnon + fusionnerReglesAnon
  sonal.mjs              parse/serializeSonal (.sonal) — lecteurs plats
  document.mjs           Document / Segment / Fragment / Extrait + renumeroter + HistoriqueDocument
  conversions.mjs        import de formats (TXT/SRT/VTT/JSON/PURGE → format Sonal) + extractFichierSonal

modules/                 VUE (scripts globaux renderer) :
  gestion_corpus.js, gestion_entretiens.js, gestion_data.js, gestion_fichiers.js,
  segmentation.js, thematisation.js, locutarisation.js, recueil.js, conversions.js,
  Synthèse.js, Anonymisation/…  (rendu DOM + interactions ; délèguent au domaine)
storage/               INFRA (CommonJS, main) :
  Storage.js (interface), LocalStorage.js, ServeurStorage.js, GitLabStorage.js, StorageFactory.js

main.js                  Process main : état canonique, handlers IPC, fenêtres
preload.js               contextBridge → window.electronAPI
*.html                   Fenêtres (voir ci-dessous)

test/                    Tests Node (node:test) :
  *.test.mjs             exécutent le VRAI code domain sur des fixtures
  fixtures/              corpus/.sonal figés, IMMUABLES (ne pas éditer en GUI)
  golden/                golden masters (régénérer : npm run test:update)
  helpers/golden.mjs
```

---

## Les fenêtres (`*.html`)

| Fenêtre | Rôle | Charge le domaine ? |
|---|---|---|
| `index.html` | fenêtre principale (corpus, données, synthèse) | ✅ `domain/index.mjs` |
| `edition_entretien.html` | édition d'un entretien (segments, codage, anon) | ✅ `domain/index.mjs` |
| `ajout-entretien.html`, `nouveau_corpus.html`, `edition_categories.html`, `saisie-*.html`, `parametres-gitlab.html`, `GitlabHelp.html` | dialogues/auxiliaires | ❌ (n'utilisent pas le domaine) |

Démarrage : `npm start` → Electron lance `main.js` → `mainWindow.loadFile('index.html')`.

---

## Tests & garde-fous

- **`npm test`** : exécute les tests `test/*.test.mjs` (Node natif, + `jsdom` pour le `.sonal`).
  Ils font tourner le **vrai** code de `domain` sur des **fixtures immuables**.
- **Golden masters** : verrouillent les invariants des formats `.crp`/`.sonal` et des vues calculées.
  Après un changement *intentionnel* de format : `npm run test:update` puis relire `git diff test/golden/`.
- **Invariant n°1** : les formats `.crp`/`.sonal` (données utilisateur) sont **strictement préservés**.

---

## Par où commencer (nouvel arrivant)

1. Ce fichier (les 3 altitudes + les 2 ponts).
2. [docs/FORMATS.md](FORMATS.md) — à quoi ressemblent `.crp` et `.sonal`.
3. [domain/](../domain/) — le métier, lisible et testé ; commence par `corpus.mjs` et `document.mjs`.
4. [MODELE_OBJET.md](MODELE_OBJET.md) — le modèle conceptuel (Corpus → Entretien → Document → Segment → Fragment).
5. [PlanPoo.md](../plans/PlanPoo.md) — l'historique du refactoring (le « pourquoi » de l'organisation actuelle).
6. [PlanPoo2.md](../plans/PlanPoo2.md) — l'évolution d'architecture commandes/événements : le bloc EAV est
   **en production** (commandes + état renvoyé directement). Le reste du plan (cycle de vie corpus,
   entretiens, codebook) a été évalué et **non poursuivi** — l'architecture hybride actuelle est
   le point d'arrêt assumé.
