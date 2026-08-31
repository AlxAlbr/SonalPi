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
| Démarrage (1ᵉʳ récent **local**) | `chargerCorpus()` — `sonal.ts`, branché sur `onMounted` | `corpus:ouvrirDossier` | **oui** |
| « Ouvrir un corpus local » (dialog) | `choisirDossier()` — `sonal.ts` | `corpus:ouvrirDossier` | **oui** |
| Clic sur un récent 🌐 ou local | `ouvrirRecent()` — `sonal.ts`, branché par type (D8) | `distant:ouvrir` / `corpus:ouvrirDossier` | distant : non (garde `corpus.json`) |
| Cartes démo (« un clic » ou modale) | `preparer()` — `composables/demo.ts` | `demo:copierSources` + `corpus:ouvrirDossier` | oui (étape 2) |
| ☁️ Ouvrir un corpus distant | modale `CorpusDistant.vue` → `ouvrirCorpusDistant(id)` | `distant:ouvrir` (miroir) | non — refuse sans `corpus.json` |
| ☁️ Nouveau corpus distant | assistant `NouveauCorpusDistant.vue` → `creerCorpusDistant()` | `distant:creer` puis `distant:ouvrir` | côté serveur (§8) |

Point commun : **toutes** passent par `CorpusStore.ouvrir()` (`src/main/corpusStore.ts`),
qui amorce si besoin, migre si besoin (`formatVersion`), puis rend le modèle.

## 2. L'amorçage (`ouvrir()` → `amorcer()`) — ONE-SHOT par store

Un dossier = un corpus. Quand on CHOISIT un dossier (dialog, récent, démarrage,
dossier de démo), `ouvrir()` ne le refuse jamais s'il n'est « pas encore corpus » :
il crée les dossiers manquants (`entretiens/`) et, si `corpus.json` manque, écrit un
**squelette** (`amorcer()`) : codebook par défaut (les 4 catégories Pondérations),
tous les autres blocs vides, `formatVersion` courant.

MAIS cet amorçage est à usage unique, par store : chaque `CorpusStore` naît avec un
drapeau `amortissable`, consommé au premier amorçage — ou dès la lecture d'un corpus
existant. Ensuite, un `corpus.json` ABSENT signifie « supprimé sur disque » :
`ouvrir()` lève la sentinelle `CORPUS_SUPPRIME` (§5) au lieu de recréer un corpus
fantôme. La garde précède toute création de dossier : rien n'est laissé derrière.

Conséquences à garder en tête :

- **Ouvrir = éventuellement écrire** — mais une seule fois par choix de dossier. Le
  dossier « juste regardé » reçoit UN squelette au moment du choix ; sa suppression
  ultérieure n'est plus jamais annulée par l'app.
- **Le squelette est indiscernable d'un corpus neuf jamais rempli** : `membership: {}`,
  aucun marqueur particulier. C'est pourquoi les gardes du mode démo (§4) distinguent
  « squelette vide » et « vrai travail » par le contenu (`membership` peuplé) et le
  marqueur `demo`.
- La migration depuis SonalPi1 (`migrerDepuisV1`) est l'exception : elle n'amorce PAS (le codebook
  par défaut serait faux), elle crée depuis le `.crp` après garde explicite.

## 3. Le démarrage et les récents

`settings.json` (niveau profil Electron) porte `recents[]`. Au montage,
`chargerCorpus()` ouvre **automatiquement le 1ᵉʳ récent** — par construction, le corpus
chargé est toujours le 1ᵉʳ récent. Premier lancement : rien ne s'ouvre, l'Accueil reste
affiché.

Le démarrage ne ressuscite rien : `corpus:recents` purge d'abord les entrées mortes
(dossier absent OU sans `corpus.json`), puis seul un corpus VIVANT est rouvert. Le
cas piégeux restant — suppression du dossier PENDANT que l'app tourne — est traité
par la sentinelle (§5). Même règle partout : un récent EST un dossier qui contient
encore un `corpus.json`.

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

## 5. Le corpus courant supprimé sur disque (sentinelle `CORPUS_SUPPRIME`)

Scénario : l'utilisateur supprime dans son explorateur le dossier du corpus OUVERT.
Avant le garde (§2), le moindre appel IPC suivant ré-amorçait un squelette vide —
la suppression était annulée en silence. Aujourd'hui, quatre couches coopèrent :

| Couche | Fichier | Rôle |
|---|---|---|
| Store | `src/main/corpusStore.ts` | `ouvrir()` lève `Error("CORPUS_SUPPRIME: …")` si `corpus.json` manque et que l'amorçage est déjà consommé ; aucun dossier n'est recréé |
| Main | `ipcMain.handle('corpus:apresSuppression')` — `index.ts` | bascule sur le PREMIER récent local contenant encore un `corpus.json` (« le suivant devient courant », et ainsi de suite) ; purge les récents morts ; renvoie `OuvertureCorpus \| null` |
| Preload | `invoquer()` — `src/preload/index.ts` | TOUS les appels IPC passent là ; sur sentinelle : déclenche la bascule, notifie les abonnés (`surSuppressionCourant`), puis RELASSE passer l'erreur — l'opération visait l'ancien corpus, elle ne doit jamais s'exécuter sur le nouveau |
| Renderer | `creerSonal()` — `composables/sonal.ts` | applique le nouveau corpus (ou un squelette vide façon premier lancement si `null`), nettoie l'état distant, retour Accueil, bannière info explicative (`infoGlobale`, `App.vue`) |

Notes :

- La sentinelle voyage dans le MESSAGE d'erreur IPC (préfixe textuel,
  `CORPUS_SUPPRIME` exporté par `shared/format.ts`). C'est volontairement simple :
  un contrat de texte entre deux processus, pas un canal supplémentaire.
- Plusieurs appels peuvent échouer en même temps : la première notification fait la
  bascule UI, les suivantes sont ignorées (garde `basculeEnCours`).
- Au démarrage, le même principe s'applique sans sentinelle : les récents morts sont
  purgés AVANT toute ouverture (§3), donc « le suivant vivant » devient courant.

## 6. Invariants à préserver

Quand vous modifiez l'ouverture, la démo ou les settings, ne cassez pas :

1. **Un dossier sans `corpus.json` devient un corpus AU MOMENT DU CHOIX SEULEMENT**
   — c'est voulu (flux « Nouveau corpus… », dossier de démo), mais ensuite c'est une
   suppression, pas un amorçage : ne jamais réintroduire d'amorçage implicite après coup.
2. **Présence ≠ existence du dossier** : côté démo, toujours tester le contenu
   (8 fichiers, marqueur du mode), jamais seulement `existsSync(dir)`. Sinon retour du
   bug « je vide, ça ressuscite ».
3. **Idempotence de `preparer()`** : par complétude des fichiers (sources), par titre
   (entretiens), par conservation de l'historique (marqueur). Une re-préparation ne doit
   ni dupliquer ni effacer.
4. **On n'écrase jamais un travail** : toute garde qui refuse un dossier doit distinguer
   travail réel vs squelette vide (même logique que `migrer:verifierDossier` côté migration depuis SonalPi1).
5. **Le renderer ne touche jamais au disque** : détections de présence et copies vivent
   dans le main (`demo:*`, `corpus:*`) ; le renderer n'interprète que leurs retours typés
   (`EtatDemoComplet`, `src/shared/format.ts`).
6. **Une opération échouée ne doit jamais s'exécuter sur le mauvais corpus** : la
   sentinelle (§5) relance l'erreur après bascule — ne pas « optimiser » en retry
   automatique de l'appel initial.

## 7. Étude de cas : « j'ai tout vidé et tout revient »

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

Résolution définitive du mécanisme de « résurrection » : la sentinelle
`CORPUS_SUPPRIME` (§5) — le store refuse de ré-amorcer, l'app bascule sur le récent
vivant suivant avec une bannière explicative. Les tests de garde vivent dans
`test/corpusStore.test.ts` (« corpus courant supprimé sur disque »).

## 8. La branche distante : créer et rouvrir un corpus sur serveur

L'accueil oppose deux mondes (solo / équipe), et la création distante existe :
un corpus peut naître directement sur le serveur. Points de couture :

### 7.1 Création directe (`distant:creer`)

L'utilisateur donne URL DAV cible + identifiants + nom de projet. L'ordre des opérations
N'EST PAS négociable — chaque inversion a été piégée par les bancs Docker :

1. `PublieurCorpus.preparerRacine()` — repère le plus long PRÉFIXE EXISTANT par
   PROPFIND descendant, puis MKCOL des segments manquants parent-d'abord.
   *Pourquoi pas un MKCOL par segment depuis l'origine ?* Les préfixes techniques
   Nextcloud (`remote.php`, `dav`…) ne sont pas adressables : 404/500 imprévisibles.
   *Pourquoi avant la sonde ?* La sonde de préconditions écrit `sonde/` DANS la cible :
   409 si le dossier n'existe pas encore (piégé par le banc Docker réel).
2. `profilerServeur()` — préconditions mesurées sur une cible qui existe désormais ;
   refus → nettoyage best effort de la feuille SI nous venons de la créer
   (`feuilleCreee`, jamais un dossier préexistant de l'utilisateur).
3. `publierSquelette(nom)` — dossiers techniques (`entretiens/`, `verrous/`,
   `presence/`, `corbeille/`) + PUT `corpus.json` sous `If-None-Match: *` : c'est le
   serveur qui tranche les courses de création bi-poste ; 412 → `ErreurDejaCorpus`,
   rien n'est jamais écrasé.
4. `coffre.enregistrer()` en DERNIER — un échec réseau ou 412 ne laisse aucun compte
   fantôme dans « comptes configurés ».
5. Le renderer enchaîne sur `ouvrirCorpusDistant(id)` : **créer = ouvrir**, comme le
   local. Le squelette vient de `src/shared/squelette.ts` — partagé avec
   `CorpusStore.amorcer()`, donc un corpus né distant a EXACTEMENT le codebook d'un
   corpus né local (testé par équivalence stricte).

### 7.2 Les récents tagués (D8)

`EntreeRecent` (`shared/format.ts`) : `{type:'local', dir, nom}` ou
`{type:'distant', id, nom, url}`. Règles :

- Un récent 🌐 se rouvre via `distant:ouvrir(id)` — **JAMAIS** son chemin miroir en
  tant que dossier local (le cycle verrou/publie serait contourné sans le savoir).
- Fraîcheur distante = compte toujours au coffre (équivalent du `existsSync` local) ;
  le nom affiché vient du miroir si présent, sinon du dernier segment d'URL.
- Au démarrage, les distants sont SAUTÉS : pas de réseau bloquant au lancement.

### 7.3 Ce que l'app ne fait PAS

- Elle ne partage pas le dossier aux collègues : c'est un geste Nextcloud du créateur
  (voir [la doc utilisateur](../user/corpus-distant.md)). Conséquence structurelle :
  Nextcloud monte le partage chez l'invité sous le BASENAME du dossier, jamais dans le
  chemin imbriqué d'origine — d'où une URL DAV « propre à chaque compte » dans le coffre.
- Elle ne crée pas de verrou à la naissance : le corpus naît complet en un PUT gardé ;
  en cas de création concurrente, le serveur n'accepte qu'un seul PUT (précondition),
  le perdant reçoit un refus net (« corpus déjà existant »).

Bancs : `test/webdav/publication.test.ts` (mémoire), `publication-nextcloud.test.ts`
(piles Docker A et B, skipIf absentes).
