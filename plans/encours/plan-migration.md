# Plan migration V1 → V2 (SonalPi `.crp` → corpus SonalPiTestV2)

> Faire entrer les corpus **SonalPi V1** dans la V2, en préservant l'identité du projet
> (son nom) et son contenu (thèmes, variables, entretiens, audio, données).
> Le `FORMAT_VERSION` interne (v1→v2→v3) est un mécanicien **interne à la V2**
> (migrations explicites de structure) : ce plan ne s'occupe que de la **frontière V1→V2**,
> c'est-à-dire de la lecture d'un `.crp` SonalPi et de la création d'un corpus V2.

---

## Référence du code source V1

SonalPi **V1** vit dans un autre dossier de l'arbre, **`Vscode/SonalPi`** (sous le même
workspace, hors du répertoire de travail actuel) — les plans existants le référencent de la
même façon (`../../SonalPi/…`). Fichiers utiles pour confirmer le format `.crp`/`.Sonal` :

| Fichier V1 | Rôle pour la migration |
|---|---|
| `Vscode/SonalPi/main.js` | création d'un corpus (`nouveauCorpus`, ~v.1040 : structure `nom`/`tabEnt`/…), lecture + encodage (`ouvrirCorpus`, ~v.1682 : `chardet`+`iconv`), réglages pseudo persistés dans le `.crp` (~v.206) |
| `Vscode/SonalPi/nouveau_corpus.html` | formulaire V1 « dossier + nom » — l'UX qu'on reproduit en V2 (aperçu, nom du projet) |
| `Vscode/SonalPi/modules/gestion_corpus.js` | structure d'un entretien V1 `tabEnt[]` : `rtrPath`, `audioPath` absolu, **copies embarquées** `tabThm/tabVar/tabDic/tabDat` (~v.418) |
| `Vscode/SonalPi/modules/Anonymisation/tableau_global.js` | format `.crp` / aplats d'entretiens `.Sonal` (~v.3019) |
| `Vscode/SonalPi/modules/Anonymisation/anon.md` | guide de référence anon (utile pour E4) |

---

## 1. Décisions déjà actées (issues des échanges)

| # | Décision | Conséquence |
|---|---|---|
| D1 | **Garder `corpus.json`** comme nom de fichier du corpus V2 (pas de nommage `<nom>.json`) | Pas d'ambiguïté à l'ouverture d'un dossier, les `recents` restent des chemins, le scan de dossier disparaît |
| D2 | **Stocker le nom du projet dans `corpus.json`** (champ additif `nom`) | L'identité voyage avec le corpus, survit au renommage du dossier, sert à l'affichage (`basename(dir)` n'est plus la seule source) |
| D3 | **Flux de migration : un `.crp` → un dossier dédié** | Le cas V1 « plusieurs `.crp` dans un même dossier » est résolu par l'utilisateur : il choisit un dossier *réservé* par corpus. Message clair au moment du choix : « vous passez en V2 : indiquez un dossier réservé à ce corpus » |
| D4 | **La V2 lit/écrit les fichiers, le renderer parse et orchestre** (philosophie actuelle : « le parsing d'import se fait côté renderer, le main ne fait que LIRE/ÉCRIRE ») | Le `.crp` (JSON) est lu par le main (encodage inclus) ; le `.Sonal` (HTML) est parsé par le pipeline existant `importSonal.ts` (DOMParser) |

---

## 2. Flux utilisateur cible

### 2.1 Entrée

Carte **« Migrer un corpus SonalPi (V1)… »** sur l'[Accueil](../../src/renderer/components/Accueil.vue),
à côté de « Ouvrir un corpus… ». Éventuellement un rappel au premier lancement
(si un dossier V1 est détecté — optionnel, à discuter).

### 2.2 Étapes du flux

1. **Choix du `.crp`** — dialogue natif (filtre `crp`, comme `dialog:choisirTexte`).
2. **Lecture + analyse** — le main lit le fichier (détection d'encodage), le renderer le parse :
   on affiche un **aperçu** avant toute écriture : nom du corpus, date de création,
   nombre d'entretiens, thèmes, variables, règles d'anonymisation.
3. **Choix du dossier dédié** — dialogue `openDirectory + createDirectory`, **pré-rempli**
   avec le nom du corpus (ex. `Documents/Sonal/<nom>` ou un dossier frère du `.crp`).
   **Gardes** (règle : on n'écrase jamais) :
   - le dossier ne doit pas contenir de `corpus.json` (même garde que `demo:verifierCorpus`) ;
   - ne doit pas être le corpus d'un mode démo ;
   - si le dossier n'est pas vide mais sans `corpus.json`, on avertit (des fichiers non liés
     peuvent y rester, mais le corpus V2 y pose `corpus.json` + `entretiens/` + `png/`).
4. **Migration** — création du corpus V2 (détail §3), puis ouverture automatique
   et ajout aux récents.

### 2.3 Cas multi-crp (plusieurs `.crp` dans un dossier V1)

Le flux est **par fichier** : chaque `.crp` migré vers son **propre dossier dédié**.
Le dossier V1 n'est ni modifié ni renommé — il reste lisible par SonalPi V1 tant que la
migration n'est pas validée côté V2. La consigne « renommer l'ancien en ajoutant `-old` »
n'est **pas nécessaire** ; on peut la documenter comme filet de sécurité facultatif.

---

## 3. Inventaire du format `.crp` et mapping vers le modèle V2

Le `.crp` est un JSON (encodage possible : UTF-8 ou windows-1252/ISO-8859-1 —
la V1 détecte via `chardet` + décode via `iconv-lite`, main.js:1682 ; **la V2 devra
ajouter ces deux dépendances**). Structure (main.js:26-31, 1040-1052) :

| Champ `.crp` | Modèle V2 | Commentaire |
|---|---|---|
| `nom` | `corpus.json.nom` (champ **additif** D2) | Identité du projet, reprise telle quelle |
| `dateCreation` | `corpus.json.meta.sourceV1.dateCreation` (additif) | Trace |
| `version` (`'1.0'`) | garde d'entrée | Liste blanche des versions `.crp` connues ; inconnue → refus propre |
| `tabThm` | `corpus.json.codebook` | Parité d'ids déjà en place : les pondérations `cat_001..004` sont les mêmes des deux côtés. Mapping : `code→id`, `nom`, `couleur` (hex, attention aux couleurs vides), `taille` (nombre nu **ou** `''` en V1 → `undefined` en V2), `rang→ordre`, `act→actif`, `cmpct` ignoré |
| `tabVar` | `corpus.json.variables` | `lib→lib`, `champ` (`'gen'`→`portee:'entretien'`, `'loc'`→`portee:'locuteur'`), `priv` (string `'true'/'false'` → booléen) |
| `tabDic` | modalités des variables | `{v, m, lib}` → `Modalite` (`m` devient l'ordre) ; attention aux entrées sans `lib` (`{v:1,m:0}` existe) |
| `tabDat` | valeurs EAV | `valeursGen` / `valeursLoc` des entretiens ; à croiser avec `tabEnt[].tabDat` |
| `tabEnt[]` | `membership` + `entretiens/<id>.json` | Voir §3.1 |
| `tabAnon` | `reglesAnon` (corpus) | **Étape ultérieure** (§5 E4) : le modèle d'anonymisation V2 est différent (règles par entretien + portée) — ne pas transposer à la va-vite |
| `meta` (settings pseudo persistés dans le `.crp`, main.js:206) | `reglesAnon` / `personnes` | À inventorier précisément (E4) |

### 3.1 Entretiens

Chaque `tabEnt[i]` pointe vers un fichier `.Sonal` **relatif au dossier du `.crp`**
(`rtrPath`, ex. `MonEntretien.Sonal`) et porte un `audioPath` **absolu** :

| Champ `.crp` | Modèle V2 |
|---|---|
| `rtrPath` | lecture du `.Sonal` (HTML) → pipeline existant `importSonal.ts` + `eav.ts` → `EntretienFichier` (`corpsTexte` ProseMirror, `annotations`, `locuteurs`, `ancres`) |
| `audioPath` | `meta.audioRef` — **chemin absolu, déjà au format v3** (référence, pas de copie) ; si absent/manquant → `null`, entretien importé vide quand même |
| `nom` | `membership.titre` + trace `meta.sourceV1.rtrPath` |
| `tabDat` / `tabLoc` | `valeursGen` / `valeursLoc` (à croiser avec le `tabDat` du `.crp`) |

**Cas `.Sonal` manquant sur disque** : à trancher (question Q1).

### 3.2 Redondance corpus ↔ entretien (complexité à garder en tête)

La V1 **duplique** les définitions : chaque `tabEnt[i]` porte ses propres copies de
`tabThm`, `tabVar`, `tabDic`, `tabDat` (gestion_corpus.js:418) **en plus** des versions au
niveau `.crp` — et le `.Sonal` de chaque entretien embarque lui aussi son `var-json`/`dic-json`.
La V2 au contraire **partitionne** : les *définitions* vivent une seule fois dans `corpus.json`
(codebook, variables), et l'*application* (valeurs, annotations) dans `entretiens/<id>.json`
(voir README, « éviter la redondance »). D'où une règle de migration à fixer :

- **Source de vérité des définitions** = le niveau corpus (`.crp` : `tabThm`/`tabVar`/`tabDic`),
  **pas** les copies embarquées de chaque entretien. On écrit les définitions **une fois** dans
  `corpus.json`, et on ne rapporte des `.Sonal` que **l'application** (valeurs, annotations,
  locuteurs, texte) — c'est déjà le contrat d'`importSonal.ts`/`importerEntretien`.
- **Risque de dérive** : les copies embarquées d'un entretien modifié plus tard que le `.crp`
  peuvent **diverger** des définitions du `.crp` (un thème ajouté/renommé après coup). → Q7.
- **Conséquence concrète** : pendant la boucle sur les entretiens, ne pas écraser les définitions
  du `.crp` avec celles d'un `.Sonal` ; le codebook/variables proviennent du `.crp` **une seule
  fois**, puis `fusionnerImport` complète si un `.Sonal` apporte du neuf.

---

## 4. Décisions à trancher (questions ouvertes)

| # | Question | Options | Reco provisoire |
|---|---|---|---|
| Q1 | `.Sonal` manquant (rtrPath absent) | (a) sauter l'entretien avec warning ; (b) créer un entretien vide avec juste l'audio | (b) — un corpus V2 doit refléter le corpus V1, l'audio est déjà là |
| Q2 | Encodage du `.crp` | (a) `chardet` + `iconv-lite` comme la V1 (2 nouvelles deps) ; (b) heuristique maison (BOM/validité UTF-8) | (a) — éprouvé en V1, zéro surprise windows-1252 |
| Q3 | `tabAnon` et settings pseudo du `.crp` | (a) migrer en `reglesAnon` ; (b) hors périmètre 1ʳᵉ itération, warning « règles d'anonymisation non migrées » | (b) — le modèle V2 anon est différent (voir plan_anon.md), à traiter dans un chantier dédié |
| Q4 | Couleurs de thèmes vides ou au format V1 (`convertColor`) | normaliser en hex | hex, défaut blanc si vide |
| Q5 | Corpus **distants** (GitLab) en V1 | hors périmètre 1ʳᵉ itération (local seulement) | documenter dans le message d'aide |
| Q6 | **Bump de version** pour le champ `nom` + `meta.sourceV1` | (a) pas de bump — précédent du champ `demo` (« additif optionnel, donc pas de bump ») ; (b) `FORMAT_VERSION = 4` + migration v3→v4 triviale | (a) — champs additifs optionnels, mécanique existante ; un bump n'apporterait rien ici, les sous-versions étant appelées à disparaître. **À arbitrer avec l'utilisateur** (il penche pour la sous-version 4) |
| Q7 | **Dérive** entre définitions `.crp` (niveau corpus) et copies embarquées d'un entretien (`.Sonal` `var-json`/`dic-json`) | (a) le `.crp` fait foi, on écarte les différences des `.Sonal` (warning) ; (b) on fusionne (ajoute ce qui manque, signale les conflits) ; (c) on demande à l'utilisateur | (a) — simple et prévisible ; le warning liste les écarts pour décision ultérieure |

---

## 5. Découpage en étapes

> **État** : E0 → E3 implémentées (lecture+aperçu, mapping définitions, entretiens+audio,
> création corpus+UI). **E4 reporté** (chantier anon — voir note) ; **E5 fait** (docs/user/migration-v1.md).

Chaque étape est indépendante, testable, et fusionnable seule.

| Étape | Contenu | Fichiers principaux | Tests |
|---|---|---|---|
| **E0 — Lecture + aperçu** ✅ | IPC `migrer:choisirCrp` (dialog + lecture + encodage), parseur `.crp` **pur** (fonctions pures, sans I/O), retour d'aperçu `{nom, dateCreation, nbEntretiens, themes, variables, reglesAnon}` | `src/main/index.ts`, `src/main/encodage.ts`, `src/shared/corpus/migrationCrp.ts` (parseur pur) | unitaires du parseur (fixtures + windows-1252) |
| **E1 — Mapping codebook/variables** ✅ | `tabThm`/`tabVar`/`tabDic` → `codebook`/`variables` (`mapperCodebook`/`mapperVariables`/`mapperDefinitions` ; `importerVariables` partagé via `shared/corpus/eav.ts`, `parentsDepuisRangs` ; fusion via `fusionnerImport`) | `shared/corpus/migrationCrp.ts`, `shared/corpus/eav.ts` | unitaires (parité `cat_NNN`, hiérarchie, suppressions V1 préservées, `taille ''`, `priv` string→bool, `champ gen/loc`, Q7) |
| **E2 — Entretiens + audio** ✅ | `migrer:lireSonal` (résolution rtrPath + encodage), `mapperEntretiensV1`, boucle d'import via `importSonal.ts` (définitions à vide — Q7), `audioPath` → `audioRef` absolu, `meta.sourceV1.rtrPath`, Q1b (`.sonal` manquant → entretien vide + audio) | `src/main/index.ts`, `src/shared/corpus/migrationCrp.ts`, `src/renderer/composables/sonal.ts` | unitaires + e2e (`.sonal` réel + WAV, Q7, Q1b), comparaison fixtures |
| **E3 — Création du corpus + UI** ✅ | Modale `MigrationCorpus.vue` (aperçu + choix dossier dédié + gardes dejaCorpus/démo/non-vide), `migrerDepuisV1` (nom + `meta.sourceV1`, jamais le bloc défaut — `amorcer()` réservé aux corpus neufs), écriture, ajout aux récents, ouverture | `src/main/corpusStore.ts`, `src/renderer/components/MigrationCorpus.vue`, `Accueil.vue`, `sonal.ts` (wrap IPC), `format.ts` (`nom`, `meta.sourceV1` — additifs, pas de bump Q6) | e2e (stub des dialogs, multi-crp, gardes, aperçu, flux complet avec entretiens) |
| **E4 — `tabAnon` → `reglesAnon`** ⏳ reporté au chantier anon | Inventaire des settings pseudo du `.crp` (`paramsAnonCorpus` : motsLiaison, thematiques, prioriteValidation), mapping `tabAnon` (porte en plus `thematique` PER/LOC/ORG/DAT) → modèle V2 | à définir avec le plan anon (`plan_anon_fin.md`, futur `paramsAnon` + catégorie de règle) | — |
| **E5 — Documentation** ✅ | Page utilisateur « Passer de SonalPi V1 à la V2 » (flux, consignes, ce qui n'est pas migré) | `docs/user/migration-v1.md` + lien README | — |

---

## 6. Points de contact dans le code (état actuel)

| Fichier | Rôle aujourd'hui | Impact migration |
|---|---|---|
| `src/main/index.ts` | dialogs `dialog:choisirTexte`/`choisirAudio`, handlers démo (`demo:lireSource`, `demo:verifierCorpus`), `changerDossier` | nouveaux handlers `migrer:*` ; garde dossier réutilisable ; `EXT_TEXTE` inchangé |
| `src/main/corpusStore.ts` | `ouvrir()`/`amorcer()` (écrit `corpus.json` sans `nom`), `importerEntretien(titre, payload, codebook, variables)` | `amorcer` accepte `{nom, sourceV1}` ; `importerEntretien` déjà prêt pour E2 |
| `src/renderer/import/importSonal.ts` + `eav.ts` | import d'un `.sonal` HTML → payload + variables | **réutilisé tel quel** pour les `.Sonal` (c'est le même format de fichier) |
| `src/renderer/composables/useProfil.ts` / `sonal.ts` | `choisirDossier`, `ouvrirDossier`, recents | wrapper `migrerDepuisV1()` (aperçu → dossier → exécution) |
| `src/renderer/components/Accueil.vue` | carte « Ouvrir un corpus… » | carte « Migrer un corpus SonalPi (V1)… » |
| `src/shared/format.ts` | `CorpusFichier` (pas de `nom`) | champ additif `nom?: string` + `meta?: { sourceV1?: … }` (Q6 : bump ou non) |
| `e2e/` | stubs de dialogs (`electronApp.evaluate`) | nouveaux tests : `e2e/migration.e2e.ts` (flux complet, multi-crp, gardes) |

---

## 7. Hors périmètre (1ʳᵉ itération)

- Corpus **distants** V1 (GitLab / URLs) — local uniquement.
- Archives/export `.zip` V1 — les entretiens y sont aplatis (`<nom>.Sonal`), à étudier plus tard.
- Migration **inverse** (V2 → V1) — hors sujet.
- `tabAnon` (E4) — chantier séparé, lié au plan anon.
- Nommage du fichier par le nom de projet (D1 : on garde `corpus.json`).

---

## 8. Risques / points de vigilance

- **Encodage windows-1252** : un `.crp` mal décodé corrompt les accents partout — d'où la reco `chardet` + `iconv-lite` (Q2) et un test sur un `.crp` réel.
- **`taille` des thèmes** : V1 stocke `''` ou un nombre (importSonal.ts gère déjà « nombre nu ou '' ») — ne pas casser la règle pondération (> 16px) du V2.
- **Id des entretiens** : V1 a des ids séquentiels (`id: rgEnt`), la V2 des ids opaques `ent-…` — pas de collision possible, mais **ne pas réutiliser** l'id V1 ; garder la trace via `meta.sourceV1.rtrPath`.
- **Ne jamais écraser** : garde `corpus.json` existant dans le dossier cible + garde « corpus d'un mode démo ».
- **Idempotence** : re-migrer le même `.crp` vers le même dossier doit être refusé (garde) ou sans effet.
- **Dérive des définitions** : ne pas laisser les copies embarquées d'un entretien `.Sonal` écraser
  les définitions du `.crp` (Q7) — la V2 partitionne, la migration doit préserver ce contrat.
