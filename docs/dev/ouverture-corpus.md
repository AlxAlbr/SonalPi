# L'ouverture d'un corpus

« Ouvrir un corpus » semble trivial — c'est en fait la partie la plus piégeuse de l'app,
car **trois mécanismes indépendants** s'y superposent :

1. **L'amorçage** : ouvrir un dossier qui n'est pas (ou plus) un corpus y *crée* un corpus neuf ;
2. **Les récents** : au démarrage, le 1ᵉʳ récent est rouvert automatiquement ;
3. **La mémoire démo** : les cartes du « Mini Corpus Test » reconstruisent (ou pas) selon
   ce que `settings.json` se souvient et ce que le disque contient *réellement*.

Leur combinaison produit des comportements contre-intuitifs si on ne les connaît pas
(typo-classique : l'utilisateur vide un dossier de corpus, relance l'app… et tout
« revient »). Ce document explique chaque mécanisme, puis les invariants à préserver.

## 1. Les chemins d'entrée

Il existe exactement quatre façons d'arrêter sur l'écran Corpus :

| Chemin | Point d'entrée renderer | Store main | Amorce si absent ? |
|---|---|---|---|
| Démarrage (1ᵉʳ récent) | `chargerCorpus()` — `sonal.ts`, branché sur `onMounted` | `corpus:ouvrirDossier` | **oui** |
| « Ouvrir un corpus… » (dialog) | `choisirDossier()` — `sonal.ts` | `corpus:ouvrirDossier` | **oui** |
| Clic sur un récent | `ouvrirRecent()` — `sonal.ts` | `corpus:ouvrirDossier` | **oui** |
| Cartes démo (« un clic » ou modale) | `preparer()` — `composables/demo.ts` | `demo:copierSources` + `corpus:ouvrirDossier` | oui (étape 2) |

Point commun : **toutes** passent par `CorpusStore.ouvrir()` (`src/main/corpusStore.ts`),
qui amorce si besoin, migre si besoin (`formatVersion`), puis rend le modèle.

## 2. L'amorçage (`ouvrir()` → `amorcer()`)

Un dossier = un corpus. `ouvrir()` ne refuse jamais un dossier « pas encore corpus » :
il crée les dossiers manquants (`entretiens/`) et, si `corpus.json` manque, écrit un
**squelette** (`amorcer()`) : codebook par défaut (les 4 catégories Pondérations),
tous les autres blocs vides, `formatVersion` courant.

Conséquences à garder en tête :

- **Ouvrir = éventuellement écrire.** Le simple fait de pointer l'app vers un dossier
  (dialog, récient, démarrage) y dépose un squelette. Le dossier « juste regardé »
  n'est plus vierge.
- **Le squelette est indiscernable d'un corpus neuf jamais rempli** : `membership: {}`,
  aucun marqueur particulier. C'est pourquoi les gardes du mode démo (§4) distinguent
  « squelette vide » et « vrai travail » par le contenu (`membership` peuplé) et le
  marqueur `demo`.
- La migration V1 (`migrerDepuisV1`) est l'exception : elle n'amorce PAS (le codebook
  par défaut serait faux), elle crée depuis le `.crp` après garde explicite.

## 3. Le démarrage et les récents

`settings.json` (niveau profil Electron) porte `recents[]`. Au montage,
`chargerCorpus()` ouvre **automatiquement le 1ᵉʳ récent** — par construction, le corpus
chargé est toujours le 1ᵉʳ récent. Premier lancement : rien ne s'ouvre, l'Accueil reste
affiché.

C'est LE point de contact surprise avec l'amorçage : si l'utilisateur a vidé son dossier
de corpus, le redémarrage **recrée un squelette** dans ce dossier (et le corpus chargé
paraît « revenu », mais vide de ses entretiens).

## 4. La mémoire démo (« Mini Corpus Test »)

### Ce qui est mémorisé

Dans `settings.json`, section `demo` : `racineSources` (partagée par les deux modes),
`corpusPasAPas` et `corpusAutonomie` (un dossier par mode). Écrite par `demo:memoriser`
à chaque préparation réussie.

### Présence RÉELLE vs présence MÉMORISÉE

Le piège historique : croire un corpus « en place » parce que son dossier existe.
La règle actuelle (`src/main/index.ts`, handler `demo:etat`) :

| Élément | « Présent » ssi… |
|---|---|
| Sources | les **8 fichiers** existent (4 SRT + 4 MP3, cf. `CLEFS_SOURCES` / `sourcesCompletes()`) |
| Corpus d'un mode | `corpus.json` existe ET porte le **marqueur `demo` DU MODE** (`corpusTestPresent()`) |

Pourquoi le marqueur ? Un vrai corpus démo en porte toujours un (`marquerDemo`, étape 4
de `preparer()`). En revanche un simple `corpus.json` peut être un **squelette amorcé**
(§2) — par exemple créé par la réouverture automatique du 1ᵉʳ récent juste après un
vidage du dossier. Exiger le marqueur évite de dire « ✓ déjà en place » à propos d'un
dossier que l app vient de vider de sa substance.

### Le flux `preparer(mode)` (renderer, `composables/demo.ts`)

Déclenché par un clic de carte, soit direct (« un clic » si mémoire + présence OK,
cf. `pretUnClic`), soit via la modale adaptative (`ModaleDemo.vue`). Cinq étapes :

1. **Copier les sources** (`demo:copierSources`) — idempotent : no-op si les 8 fichiers
   sont là ; sinon recopie complète depuis les sources bundled `CorpusTest/`
   (dev : racine du projet ; prod : `extraResources`).
2. **Ouvrir le dossier du mode** (`corpus:ouvrirDossier`) — amorce si neuf.
3. **Importer les entretiens** (mode autonomie) — idempotent PAR TITRE : un titre
   déjà présent dans `membership` n'est jamais réimporté. L'audio est *référencé*
   (chemin absolu vers la racine des sources), jamais copié.
4. **Marquer** (`corpus:marquerDemo`) — pose `{ demo: { mode, racineSources, validees } }`
   en CONSERVANT l'historique du même mode (une re-préparation ne remet pas le pas-à-pas à zéro).
5. **Mémoriser** (`demo:memoriser`) — persiste les dossiers, l'autre mode préservé.

### Les gardes de la modale (`ModaleDemo.vue` + `demo:verifierCorpus`)

| Garde | Refuse | Mais laisse passer |
|---|---|---|
| sources ≠ corpus | mêmes deux dossiers | — |
| indépendance des modes | le dossier de l'AUTRE mode | — |
| on n'écrase jamais | corpus marqué démo ; corpus non marqué mais **non vide** (`membership` peuplé) ; `corpus.json` illisible (prudence) | le **squelette amorcé vide** — il n'est pas un travail utilisateur, et le bloquer interdirait à jamais de reconstruire dans un dossier qu'une simple ouverture a amorcé |

## 5. Invariants à préserver

Quand vous modifiez l'ouverture, la démo ou les settings, ne cassez pas :

1. **Un dossier sans `corpus.json` devient un corpus** — c'est voulu (flux « Nouveau
   corpus… »), mais toute nouvelle voie d'ouverture doit le savoir.
2. **Présence ≠ existence du dossier** : côté démo, toujours tester le contenu
   (8 fichiers, marqueur du mode), jamais seulement `existsSync(dir)`. Sinon retour du
   bug « je vide, ça ressuscite ».
3. **Idempotence de `preparer()`** : par complétude des fichiers (sources), par titre
   (entretiens), par conservation de l'historique (marqueur). Une re-préparation ne doit
   ni dupliquer ni effacer.
4. **On n'écrase jamais un travail** : toute garde qui refuse un dossier doit distinguer
   travail réel vs squelette vide (même logique que `migrer:verifierDossier` côté migration V1).
5. **Le renderer ne touche jamais au disque** : détections de présence et copies vivent
   dans le main (`demo:*`, `corpus:*`) ; le renderer n'interprète que leurs retours typés
   (`EtatDemoComplet`, `src/shared/format.ts`).

## 6. Étude de cas : « j'ai tout vidé et tout revient »

Scénario réel ayant motivé ce document et trois correctifs :

1. L'utilisateur inverse les dossiers source/corpus dans la modale démo, puis vide
   `Autonom/` et `Source/` pour recommencer.
2. Il relance l'app : le démarrage rouvre le 1ᵉʳ récent (`Source/`), désormais sans
   `corpus.json` → **amorce un squelette**.
3. Il clique la carte « En autonomie » : si la présence était testée par `existsSync`
   seul, tout était « en place » → reconstruction silencieuse complète.

Correctifs résultants (chercher ces symboles avant de refactorer) :
`sourcesCompletes()` (présence par fichiers), `corpusTestPresent()` (présence par
marqueur), garde squelette-vide dans `demo:verifierCorpus`.
