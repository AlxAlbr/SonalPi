# Plan — Audio par référence (parité SonalPi)

> Objectif : l'audio d'un entretien est **référencé** (chemin absolu du fichier
> d'origine, jamais copié) au lieu d'être **copié** dans `<corpus>/audio/` —
> la sémantique de stockage de SonalPi. **`meta.audioRef` devient absolu
> uniquement** (plus de polymorphisme runtime) : les corpus v2 existants sont
> migrés silencieusement à l'ouverture (v2→v3, `audioRef` relatifs résolus en
> absolus une fois pour toutes). Effet collatéral assumé : ça résout le
> problème d'origine du pas-à-pas (§7) — plus aucune copie de démo, l'étape 1
> redevient un geste réel sur la vraie UI.

**État** : implémentation **TERMINÉE** — J1 (main), J2 (renderer), J3
(intégrité), J4 (démo & pas-à-pas) et J5 (passe e2e complète, migration
v2→v3 vérifiée) tous **terminés** : 158 tests unitaires + 51 e2e au vert.
Voir §12 (journal d'implémentation).

## 1. Décisions

1. **`meta.audioRef` = chemin absolu uniquement** (ou `null`). Plus de
   polymorphisme relatif/absolu au runtime : un seul modèle mental. Les corpus
   v2 (refs relatives) sont migrés silencieusement à l'ouverture (§8). Côté
   renderer, le routing URL devient **par type de ressource** (audio → hôte
   `abs`, PNG → hôte `waveform`), pas par nature de chemin → **suppression de
   l'helper `estRefExterne`** prévu initialement (§5.1).
2. **Toute nouvelle assignation = référence absolue** : zone son de la modale
   « + Ajouter un entretien », bouton « Assigner un audio », builder de démo.
   Re-assigner l'audio d'un entretien = écraser la référence (pas de re-copie
   — c'était un coût caché aujourd'hui sur les gros fichiers).
3. **L'app ne touche jamais les fichiers externes** :
   - assigner = stocker le chemin ;
   - supprimer un entretien = retirer la référence (seuls le fichier entretien
     et les dérivés locaux vont à la corbeille) ;
   - la **forme d'onde (PNG) reste dans le corpus** (`png/<id>.png`) : c'est
     un dérivé régénérable, petit, hors format natif — on ne le met pas chez
     l'utilisateur. **Le PNG n'est jamais une "référence"** : il n'est pas
     stocké dans l'entretien, c'est une convention de nommage découverte par
     scan (`ecrireWaveform` renvoie `png/<id>.png`, construit pas lu).
4. **Le dossier `png/` du corpus** est la maison des waveform (dérivés PNG) —
   renommage `audio/` → `png/` au passage à v3 (le nom devient fidèle au
   contenu). Le dossier `audio/` devient un **reliquat pour les corpus migrés
   v2→v3** (mp3 legacy référencés en absolu vers `<corpus>/audio/<id>.mp3`) ;
   il n'existe pas pour les nouveaux corpus v3 et disparaît avec le temps.
5. **Bump `FORMAT_VERSION` 2 → 3** + migration silencieuse à l'ouverture. Le
   type ne change pas (`string | null`) mais le **domaine de valeurs** change
   (absolu uniquement) — d'où le bump. La migration est mécanique :
   `audioRef` relatif → `path.resolve(dir, audioRef)`, par entretien du
   membership. Elle s'inscrit dans la mécanique de migration existante (v1→v2
   déjà là dans `ouvrir()` / `lireEntretien()`) : pas de nouveau mécanisme.
   `versionSupportee(v)` ne renvoie que `v === 3`. Le bump v3 est aussi
   l'occasion de **renommer le dossier des waveform `audio/` → `png/`**
   (§1.4) : la migration déplace les PNG existants `audio/<id>.png` →
   `png/<id>.png` (les mp3 legacy restent dans `audio/`, référencés en absolu).
6. **Le dossier de corpus n'est plus auto-suffisant** quand il contient des
   références (portabilité). C'est l'assomption SonalPi. Compensations :
   check d'intégrité à l'ouverture (§6) + « Sauvegarder le corpus (avec
   audio) » reporté en v2 (§11).
7. **Création de corpus** : on **garde** le flow actuel « choisir un dossier »
   (dossier = corpus, nom du dossier = nom du corpus). On ne réintroduit pas
   le 2ᵉ champ « nom du projet » de SonalPi : c'est la simplification « plus
   propre » — un nom séparé du dossier serait une source de dérive. (Revisit
   en v2 via un champ `nom` d'affichage dans `corpus.json` si le besoin se
   montre, sans migration.)
8. **Sources de démo : matérialisées dans un dossier choisi par l'utilisateur**
   (§7.2). Le `CorpusTest/` bundled devient une **graine** : l'app le copie une
   fois (la seule copie du flow de démo, ~13 Mo) dans un dossier choisi par une
   modale à deux questions, et le corpus **référence** les fichiers de ce
   dossier. Le chemin prod opaque ne remonte jamais à l'utilisateur.

## 2. Référence : ce que fait SonalPi (vérifié)

| Fait | Ancrage |
|---|---|
| Modale de création : « 1 - Où seront stockés les fichiers ? » + « 2 - Quel est le nom du projet ? » | [nouveau_corpus.html](../../SonalPi/nouveau_corpus.html) :117-124 |
| `audioPath` = **chemin du fichier d'origine**, stocké tel quel | [gestion_entretiens.js](../../SonalPi/modules/gestion_entretiens.js) :208 |
| Lecture directe depuis l'origine : `audio.src = ent.audioPath` | ibid. :1339 |
| Bloc commenté où ils avaient envisagé de résoudre le chemin *dans* le dossier corpus — et choisi de ne pas le faire | ibid. :1342-1348 |
| Le fichier audio est l'**ancrage** de l'entretien : le texte `.sonal` est nommé d'après lui | ibid. :133-136 |
| Le chemin audio est affiché dans l'entête de l'entretien | ibid. :1146 |

## 3. État actuel SonalAsynchro (à transformer)

| Comportement | Ancrage |
|---|---|
| `assignerAudio` **copie** `copyFileSync` → `<corpus>/audio/<id>.<ext>`, `audioRef` relatif | [corpusStore.ts](../src/main/corpusStore.ts) :460 |
| Protocole `sonal-media` : stream **uniquement** depuis `<corpus>/audio/`, garde anti-traversal explicite | [main/index.ts](../src/main/index.ts) :197, [corpusStore.ts](../src/main/corpusStore.ts) `cheminMedia` :516 |
| `audios()` = scan du dossier `audio/` (REQUÊTE) — audio + waveform tous deux par convention de nommage | [corpusStore.ts](../src/main/corpusStore.ts) :498 |
| Waveform PNG écrit dans `audio/<id>.png` (dérivé) — **jamais stocké dans l'entretien**, découvert par scan ; **renommage `audio/` → `png/` au passage à v3** | `ecrireWaveform`, ibid. :486 |
| `supprimerEntretien` déplace `audio/<id>.*` dans `corbeille/` | ibid. :272 |
| `urlMedia(rel)` → `sonal-media://corpus/<rel>` — sert l'audio ET le PNG par le même hôte | [waveform.ts](../src/renderer/audio/waveform.ts) :7 |
| `.sonal` export : **pas de media embarqué** (parité déjà acquise) | [exportSonal.ts](../src/renderer/import/exportSonal.ts) |
| Démo : `importerSource` copie chaque mp3 bundled dans le corpus | [demo.ts](../src/renderer/composables/demo.ts) :77 |
| `FORMAT_VERSION = 2` ; migration v1→v2 déjà implémentée dans `ouvrir()` / `lireEntretien()` | [format.ts](../src/shared/format.ts) :13, [corpusStore.ts](../src/main/corpusStore.ts) :114, :164 |

## 4. Main — `corpusStore`

### 4.1 `assignerAudio(id, source)` → référence absolue

- `source` inexistant → `null` (inchangé).
- **Normaliser au stockage** : `fileURLToPath` (certains dialogs Linux renvoient
  `file://`) + `path.normalize` (comparaison whitelist fiable — §4.3). Le chemin
  stocké est toujours un chemin absolu natif **normalisé**.
- Supprimer la `copyFileSync` et la normalisation du nom (`<id>.<ext>`) :
  `audioRef = sourceNormalisée`. Le fichier garde son nom d'origine (comme
  SonalPi).
- `meta` + `membership.lastModified` : inchangés.
- Idempotence : re-appeler sur le même entretien = écraser la référence.
- **Invariant de cache** : `audioRef` est muté **uniquement** via
  `assignerAudio`. Le renderer round-tripe la valeur existante sans la
  modifier dans `ecrireEntretien` (à vérifier à l'implémentation). Si
  l'invariant ne tient pas, normaliser l'`audioRef` du payload à l'écriture
  dans `ecrireEntretien` et invalider le cache (§4.3).
- La forme d'onde (dérivé, dans le corpus) est générée par le renderer comme
  aujourd'hui (§5.4) — elle continue de marcher car le protocole sait servir
  la référence (§4.2).

### 4.2 `cheminMedia` → deux hôtes par nature de ressource

Le renderer construit deux hôtes distincts (§5.1), le handler switch sur
`new URL(req.url).hostname` :

- `sonal-media://waveform/<id>` → branche **dérivé local** : résolution **par
  id** (opaque, issu de `genId`), pointe vers `<corpus>/png/<id>.png`. Plus
  d'anti-traversal sur un chemin (l'id n'est jamais un chemin) → plus sûr que
  l'actuel `cheminMedia(rel)`. Nouvelle méthode `cheminWaveform(id)`.
- `sonal-media://abs/<chemin absolu encodé>` → branche **référence externe** :
  **whitelist stricte** — le chemin normalisé doit appartenir à l'ensemble des
  `meta.audioRef` stockées dans le corpus **courant** (cache §4.3),
  + `existsSync`. Nouvelle méthode `cheminMediaAbs(p)`. Jamais de garde par
  préfixe de dossier (ce serait une faille : n'importe quel chemin du disque
  serait servissable au renderer).

La méthode actuelle `cheminMedia(rel)` est **supprimée** (elle ne servait que
l'audio relatif legacy, qui disparaît).

### 4.3 Cache `refsAudio`

La vérification par requête (relecture des N fichiers entretiens à chaque
request, y compris les Range du `<audio>` pendant la lecture) est trop
coûteuse. Décision : **cache en mémoire** dans le store,

- **forme recommandée** : `Map<id, string>` (id → `audioRef` normalisée non-null)
  — couvre les deux usages : whitelist `abs` (valeurs) ET `audios()` (§4.4) ;
  alternative `Set<string>` des seules valeurs si on sépare les usages ;
- calculé à `ouvrir()` / `changerDossier` (passe de lecture des entretiens,
  partagée avec `audios()` §4.4) ;
- invalidé par `assignerAudio`, `supprimerEntretien` (+ `ecrireEntretien` si
  l'invariant §4.1 ne tient pas) ;
- comparaisons sur chemins **normalisés au stockage** (§4.1) ;
- fallback sûr : à défaut de cache, refuser (pas de relecture sauvage).

### 4.4 `audios()` → résolution par référence

- **waveform** : scan de `png/` par convention de nommage (le PNG reste un
  dérivé local découvert par nom ; le dossier est renommé `audio/` → `png/` au
  passage à v3, §1.4).
- **audio** : plus de scan — pour chaque entretien du membership, renvoyer son
  `meta.audioRef` (toujours absolu) ; lu depuis la passe de lecture partagée
  avec le cache `refsAudio` (§4.3).
- **Contrat de retour simplifié** : `Record<id, { audio: string | null;
  waveform: boolean }>` — `audio` = `audioRef` absolu, `waveform` = le PNG
  existe ou non (l'id étant la clé, le renderer n'a plus besoin du chemin
  relatif du PNG pour construire son URL — §5.1). Forme à confirmer à
  l'implémentation (garder `waveform: string | null` reste possible, le
  renderer l'ignore au profit de l'id).

### 4.5 `supprimerEntretien` → non destructeur sur l'externe (trivial)

- Fichier entretien → `corbeille/` : inchangé.
- `png/<id>.png` (dérivé) → `corbeille/` : la boucle actuelle `audio/<id>.*`
  devient un scan de `png/<id>.png` (adaptation du chemin au renommage §1.4) ;
  elle ne déplace que le PNG.
- **Aucune branche sur `audioRef`** : on ne touche **jamais** au fichier
  audio externe — il n'a jamais été copié. La suppression ne lit pas
  l'entretien (comme aujourd'hui).

### 4.6 Nouveau : `corpus:verifierAudios()` (intégrité)

- IPC → `{ [entretienId]: 'ok' | 'manquant' }` pour les entretiens dont
  l'`audioRef` est non-null (`existsSync` batché dans le main).
- Réutilise le cache `refsAudio` (§4.3) pour éviter une relecture des entretiens.
- Sert au check d'ouverture (§6).

## 5. Renderer

### 5.1 `urlMedia` — deux hôtes par type de ressource

Le routing devient **par type de ressource** (l'appelant sait s'il demande
l'audio ou le PNG), pas par nature de chemin → **suppression de l'helper
partagé `estRefExterne`** prévu initialement. Deux fonctions dédiées :

```
audio    → urlMediaAudio(audioRef)        → sonal-media://abs/<encodeURIComponent(audioRef)>
waveform → urlMediaWaveform(id, v?)        → sonal-media://waveform/<id>?v=<lastModified>
```

- `urlMediaAudio(audioRef)` : nouvelle — vers l'hôte `abs` (whitelist côté
  main §4.2). Utilisée par `genererEtEcrireWaveform` (fetch des octets audio)
  et le lecteur (`<audio>`).
- `urlMediaWaveform(id, v)` : nouvelle — vers l'hôte `waveform` (résolu par
  id côté main §4.2). Remplace l'actuel `urlMedia(rel, v)` pour le PNG.
  L'id vient de la clé du `Record` retourné par `audios()` (§4.4).
- ⚠️ Pas de piège `pathname.replace(/^\/+/, '')` : l'hôte `waveform` prend un
  id opaque (sans barre initiale à manger), l'hôte `abs` prend un chemin
  encodé dans le pathname.
- [waveform.ts](../src/renderer/audio/waveform.ts) :7 — `urlMedia` est
  remplacée par les deux fonctions ; `genererEtEcrireWaveform` (fetch des
  octets audio) marche sans autre change (elle reçoit déjà `audioRef`).

### 5.2 Modale « + Ajouter un entretien » — transparence

[AjoutEntretien.vue](../src/renderer/components/AjoutEntretien.vue) : ligne
d'info sous la zone son :

> « L'audio est **référencé, pas copié** : le fichier d'origine doit rester à
> cet endroit. »

C'est l'information contractuelle du nouveau modèle — l'utilisateur doit savoir
que déplacer son mp3 casse la référence (le check §6 le rattrapera, mais la
prévenir est mieux).

### 5.3 État d'erreur local : audio manquant

Si l'`audioRef` absolue pointe vers un fichier disparu (découverte à la lecture,
pas seulement à l'ouverture) : le lecteur affiche « Audio introuvable — le
fichier a peut-être été déplacé » + le bouton « Assigner un audio » existant
pour ré-aiguiller. **Le texte, les codages et le reste de l'entretien restent
utilisables** — on ne crash jamais pour un média manquant.

### 5.4 Parité SonalPi (petit plus)

> ⚠️ **ÉCARTÉ à l'implémentation (décision 2025-08-18, cf. §12.7)** : un nom de
> fichier long encombre la barre d'entête. La transparence du modèle reste
> portée par la note de la modale (§5.2) et le bandeau d'intégrité (§6).

Afficher le **basename** du fichier audio dans l'entête de l'entretien, chemin
complet en tooltip (SonalPi l'affiche en clair, [gestion_entretiens.js](../../SonalPi/modules/gestion_entretiens.js):1146). Renforce la transparence de §5.2.

## 6. Check d'intégrité à l'ouverture

- `appliquerCorpus` → `corpus:verifierAudios()` → ref `audiosManquants` dans
  le scope (scope démo/sonal — à trancher à l'implémentation, probablement
  `useCorpus`).
- Vue Corpus : bandeau au-dessus des cartes si non vide :
  « ⚠️ N fichier(s) audio introuvable(s) — déplacé(s) ou supprimé(s) ? » avec
  la liste des entretiens concernés ; clic = ouvrir l'entretien (ré-assignation
  via §5.3).
- C'est le filet de sécurité qui compense la perte d'auto-suffisance (§1.6).
- Pas de refresh en session : le bandeau est calculé à l'ouverture. Si un
  fichier réapparaît ou disparaît pendant la session, seul §5.3 le rattrape
  (par entretien). Un ré-ouvrir le corpus rafraîchit. Acceptable pour v1.

## 7. Conséquences sur la démo & le pas-à-pas (résout le problème d'origine)

### 7.1 Histoire du problème (fil de la discussion)

1. **Reproche d'origine** : l'étape « Charger un entretien » du pas-à-pas
   affichait une **bulle centrée avec un bouton « Charger l'entretien »**
   ([demo.ts](../src/renderer/composables/demo.ts) `cible: () => null` +
   [PasAPas.vue](../src/renderer/components/PasAPas.vue) voile plein) —
   l'impression d'un bouton d'UI recréé par le tutoriel, déconnecté du vrai
   bouton « + Ajouter un entretien ».
2. **Cause racine à l'époque** : les sources de démo étaient **bundlées dans
   l'app** ([main/index.ts](../src/main/index.ts) `cheminCorpusTest()`) — en
   prod, un chemin **opaque pour l'utilisateur** (`<resources>/CorpusTest`,
   ex. `AppData\Local\Programs\…\resources\` sous Windows). La vraie modale
   d'import (deux zones, dialogues de fichiers natifs) était donc
   **inexploitable** dans le tutoriel : l'utilisateur ne pouvait pas trouver
   les fichiers → le one-click dans la bulle était le seul geste possible.
3. **Ce que l'audio par référence change (§4)** : l'import ne **copie plus** le
   mp3 dans le corpus. L'obstacle restant au « geste réel sur la vraie UI » est
   un seul : **que l'utilisateur puisse trouver les fichiers sources**.
4. **L'échec du correctif naïf** : se contenter d'*afficher* le chemin bundled
   dans le texte de l'étape ne suffit pas — pour un utilisateur lambda, « le
   dossier de l'application » n'est pas un endroit où il sait se rendre. →
   **les sources doivent être matérialisées dans un dossier choisi et connu par
   l'utilisateur.** C'est la décision §7.2.

### 7.2 Décision : modale à deux dossiers (façon SonalPi)

Au clic sur les cartes « Découverte pas à pas » ou « En autonomie » de
[Accueil.vue](../src/renderer/components/Accueil.vue) (aujourd'hui
`preparer(mode)` → un seul choix de dossier), s'ouvre une **modale à deux
questions**, à la [nouveau_corpus](../../SonalPi/nouveau_corpus.html) de SonalPi (§2) :

1. **« Où voulez-vous placer les sources de la démo ? »** → dossier dans
   lequel l'app **copie une fois** le `CorpusTest/` bundled (`srt/` + `audio/`,
   ~13 Mo). **Seule copie** de tout le flow de démo.
2. **« Où voulez-vous placer le corpus de travail ? »** → dossier de corpus
   (amorcé comme aujourd'hui : `corpus.json` + bloc `Pondérations`).

Pourquoi c'est le bon choix (alternatives écartées) :

| Alternative | Rejet |
|---|---|
| Sources dans l'app, chemin affiché dans le texte de l'étape | L'utilisateur lambda ne sait pas localiser le dossier de l'app en prod (point 4) — le geste réel reste impossible |
| Un seul picker : sources en sous-dossier du corpus (`<corpus>/sources/`) | Pollue le dossier du corpus ; couple les cycles de vie (supprimer le corpus = supprimer les sources) ; ne reflète pas la réalité — dans une vraie enquête, la **matière brute** et le **dossier de projet** sont deux endroits |
| Un seul picker + dossier source « frère » implicite | Un endroit invisible dans le picker, moins explicite |

À deux dossiers : **l'utilisateur possède et connaît les deux endroits** → à
l'étape 1 il peut réellement naviguer jusqu'aux sources dans le vrai dialogue
fichier ; le principe « copie jetable » (plan-tutoriel §1) devient concret
(détruire deux dossiers = détruire la démo) ; le chemin bundled opaque ne
remonte jamais. Le `CorpusTest/` bundled devient une **graine** (copiée, jamais
ouverte directement).

Gardes :
- les deux dossiers doivent être **distincts** (refusé par la modale s'ils sont
  identiques — sinon le sous-dossier `audio/` du corpus chevaucherait
  `sources/audio/`). La garde exact-égalité suffit : un `sources` sous-dossier
  de `corpus` (ou inverse) ne provoque aucun chevauchement ;
- `defaultPath` des pickers : `Documents/Sonal/démo/sources` et
  `Documents/Sonal/démo/corpus` (désamortit le geste, modifiable) ;
- re-préparation = écrasement **idempotent** (recopie + ré-références), mêmes
  gardiens que le builder actuel (marqueur démo, plan-tutoriel §12.3). Sémantique
  de la recopie à trancher : fichier-à-fichier (stale possibles si l'utilisateur
  a supprimé un fichier dans `racineSources`) ou clean-then-copy (plus sûr,
  détruit les modifs utilisateur).

### 7.3 Le builder, nouvelle mouture

`preparer(mode, { racineSources, dossierCorpus })` — la modale fournit les deux :

1. `demo:copierSources(racineSources)` — **nouvel IPC main** : copie récursive
   `cheminCorpusTest()` → `racineSources` (idempotent, ~13 Mo, une fois) ;
2. amorçage du dossier de corpus (le travail actuel du picker, ici alimenté par
   le choix de la modale) ;
3. pour chaque source requise — *autonomie* : E1–E4 ; *pas-à-pas* : **aucune
   au départ** (les étapes remplissent) — `importerSource(k, racineSources)` :
   - SRT : `demo:lireSource(racineSources, 'srt/Ek.srt')` →
     `importerFichier` → `corpus:importer` (vrai pipeline, inchangé) ;
   - audio : `corpus:assignerAudio(id, <racineSources>/audio/Ek.mp3)` →
     **référence** (§4.1) — seule différence avec aujourd'hui : plus de copie ;
4. atterrissage inchangé (vue Corpus ; pas-à-pas : activation de l'étape 1 +
   pré-création de la variable « Ville »).

IPC main concernés (en plus de §4) :
- **nouveau** `demo:copierSources(racine)` ;
- `demo:lireSource(rel)` → `demo:lireSource(racine, rel)` (paramétrage de la
  racine — aujourd'hui fixée au bundled) ;
- `demo:cheminAudio(rel)` → `demo:cheminAudio(racine, rel)` (renvoie
  `<racine>/audio/Ek.mp3`, passé tel quel à `corpus:assignerAudio` qui ne copie
  plus).

Le scope `demo` ([demo.ts](../src/renderer/composables/demo.ts)) mémorise
`racineSources` (ref posée dans `preparer`) — utilisée par l'action one-click et
par le texte des étapes.

### 7.4 L'étape 1 « Charger un entretien », nouvelle mouture

- `data-tour="ajouter-entretien"` posé sur le vrai bouton « + Ajouter un
  entretien » ([AjoutEntretien.vue](../src/renderer/components/AjoutEntretien.vue):97) ;
- `cible: () => '[data-tour="ajouter-entretien"]'` → le spotlight **encadre le
  vrai bouton**, la bulle se cale à côté (positionnement déjà existant dans
  `PasAPas.vue`) ;
- texte : « Tes sources sont dans `<racineSources>`. Dans la modale, choisis
  `srt/E2.srt` (Sylvie), puis `audio/E2.mp3` — ou je le fais à ta place. » ;
- **le one-click reste**, renommé « Faire à ma place : importer Sylvie » →
  `importerSource('E2', racineSources)` — une commodité, plus un substitut à la
  UI. ⚠️ `PasAPas.vue` a aujourd'hui un bouton au texte générique
  (`Charger l'entretien`) → ajouter un champ `libelleAction?: string` dans
  `EtapePasAPas` (demo.ts) pour le personnaliser par étape ;
- les deux gestes valident le même prédicat (`membership` non vide) ;
- **bonus pédagogique** : l'utilisateur qui fait le geste lui-même passe par la
  vraie modale à deux zones (le point d'entrée unique, à la SonalPi) — il
  apprend le geste d'import *réel* de Sonal, pas un geste spécifique démo.

⚠️ **`defaultPath` des dialogues natifs (point ouvert)** : l'objectif « geste
réel » suppose que l'utilisateur retrouve les sources dans le dialogue fichier
natif. Or `dialog:choisirTexte` / `dialog:choisirAudio` (main/index.ts) n'ont
pas de `defaultPath` → le dialogue s'ouvre à un défaut OS, pas dans
`racineSources`. À trancher : ajouter un `defaultPath` optionnel (hinté par le
scope démo) à ces IPC pendant le pas-à-pas ? Sans cela, le geste réel reste
entravé. Voir §11.

### 7.5 « En autonomie » : la même modale (décision proposée — à confirmer)

Recommandation : la **même modale à deux dossiers pour les deux modes**
(composant partagé, lancé depuis les deux cartes de l'Accueil). Raisons :
- coût nul additionnel (composant partagé) ;
- même argument de portabilité : un corpus d'autonomie qui *réfère* des sources
  bundled opaques est fragile (désinstallation de l'app → références cassées) ;
  la matérialisation des sources le répare au passage ;
- un seul récit : « la démo = ton dossier de sources + ton dossier de travail. »

Fallback (si on veut minimiser la friction d'autonomie) : un seul picker
(corpus) + sources posées automatiquement. Écarté en v1 (tableau §7.2) —
revoir si le clic en plus gêne.

Bascule pas-à-pas → autonomie sur le même corpus (plan-tutoriel §14.4) : les
sources sont déjà en place → le builder réutilise `racineSources` (re-préparation
idempotente, **pas de 2ᵉ modale**).

### 7.6 Tests / e2e

- `demo.e2e.ts` : stubs des deux pickers (comme aujourd'hui via
  `showOpenDialog`) ; assertions :
  (i) les sources sont **copiées** dans le dossier choisi (`srt/` + `audio/`
  intacts) ;
  (ii) **aucune copie d'audio** dans le corpus (seuls les PNG d'onde dans
  `png/`) ;
  (iii) les `audioRef` = **chemins absolus** dans le dossier sources choisi.
- `pas-a-pas.e2e.ts` : étape 1 → bulle à côté du **vrai** bouton
  (`spotlight-trou` sur `data-tour="ajouter-entretien"`) ; le one-click « Faire à
  ma place » valide toujours l'étape ; (variante à ajouter) geste fait par la
  **vraie** modale (stubs `dialog:choisirTexte` / `dialog:choisirAudio`) → même
  prédicat.
- Scénario « dossier sources supprimé après préparation » → bandeau
  d'intégrité (§6) — même mécanique, couvert par les tests du J3.

### 7.7 Synchronisation plan-tutoriel

Cette section fait évoluer le plan-tutoriel — à synchroniser au J4 (une note
pointeur est posée dans son §12) :
- §11.3 (« l'utilisateur **choisit un dossier** » → **choisit deux** : sources
  + travail) ;
- §12 (signature `demo:preparer(dossier, mode)` →
  `(dossierCorpus, racineSources, mode)` ; IPC `demo:copierSources` +
  paramétrage de `demo:lireSource` / `demo:cheminAudio`) ;
- §14.1–14.2 (étape « charger » : `cible` = vrai bouton, one-click renommé,
  texte cite `racineSources`).

## 8. Migration & compatibilité

| Cas | Comportement |
|---|---|
| Corpus v2 existant (copies relatives) | **Migration silencieuse à l'ouverture** : dans `ouvrir()`, après la branche v1→v2 existante, si `formatVersion === 2`, résoudre chaque `audioRef` relatif en absolu (`path.resolve(dir, audioRef)`) + bump `formatVersion = 3` ; réécriture atomique par entretien + corpus. Mécanique identique à la migration v1→v2 (store l'applique à la lecture et réécrit aussitôt). Les fichiers audio copiés dans `<corpus>/audio/` sont désormais **référencés sur place** (absolu vers leur emplacement existant) — aucune recopie, aucun orphelin. **Renommage `audio/` → `png/`** : les PNG existants `audio/<id>.png` sont déplacés vers `png/<id>.png` ; les mp3 legacy restent dans `audio/` (référencés en absolu vers ce dossier). |
| Corpus v3 (refs absolues) | Ouvert tel quel (`versionSupportee(v) === v === 3`) |
| Corpus mixte | N'existe plus après migration (tout absolu) |
| Import `.sonal` | Inchangé — le format n'embarque pas de media, `audioRef: null` à l'import ([importSonal.ts](../src/renderer/import/importSonal.ts):191), ré-assignation manuelle comme aujourd'hui |
| Export `.sonal` | Inchangé — parité SonalPi déjà acquise (§3) |
| `FORMAT_VERSION` | Bump 2 → 3 (§1.5) |

⚠️ La migration ne crée pas de copie : un corpus v2 dont l'audio était copié
dans `<corpus>/audio/E2.mp3` devient `audioRef = <corpus>/audio/E2.mp3`
(absolu vers le même fichier). Si l'utilisateur supprime ensuite l'entretien,
le fichier audio reste dans `audio/` (la suppression §4.5 ne le déplace plus) —
cohérent avec le nouveau modèle (l'app ne touche jamais l'audio). Acceptable :
le dossier `audio/` devient un reliquat pour les corpus migrés (mp3 legacy
référencés en absolu), un éventuel mp3 résiduel est un artefact bénin (pas
référencé ailleurs) ; il disparaît avec le temps (les nouveaux corpus v3 n'ont
que `png/`).

## 9. Risques & garde-fous

| Risque | Mitigation / garde-fou |
|---|---|
| Référence cassée (fichier déplacé/supprimé) | Check d'ouverture + bandeau (§6) ; état d'erreur local non bloquant (§5.3) ; e2e : supprimer le fichier source → bandeau affiché, app fonctionnelle |
| Protocole `abs` = fuite de fichiers arbitraires | Whitelist stricte sur les `audioRef` stockées (§4.3) ; **test unitaire : un chemin hors whitelist → 404** (y compris des chemins qui *ressemblent* à des refs) |
| Suppression accidentelle d'un fichier externe | `supprimerEntretien` ne déplace que le PNG dérivé (§4.5) — trivial, pas de branche ; **e2e : le fichier source est intact après suppression de l'entretien** |
| Dialogs renvoyant `file://` (certains Linux) | Normalisation `fileURLToPath` dans `assignerAudio` (§4.1) |
| Chemins absolus boundés à la machine | Assomption assumée (SonalPi identique) ; v2 : « Sauvegarder le corpus (avec audio) » |
| Waveform orpheline si la référence casse | Accepté : le PNG est un dérivé régénérable ; l'état d'erreur lecteur (§5.3) prend le relais ; régénération au ré-aiguillage |
| Cache `refsAudio` périmé (invalidation ratée) | Tests unitaires d'invalidation (assign/supprimer/changer de dossier) ; invariant §4.1 (`audioRef` muté uniquement via `assignerAudio`) ; fallback sûr : à défaut de cache, refuser (pas de relecture sauvage) |
| Migration v2→v3 sur `audioRef` corrompu (non-string) | Guard : `typeof audioRef === 'string'` avant `path.resolve` ; sinon laisser tel quel (null ou aberration) |
| Dossier sources de démo déplacé/supprimé après préparation | Bandeau d'intégrité (§6) — la référence casse comme toute autre ; « Réinitialiser la démo » recopie les sources (§7.2) |
| Dossier sources = dossier de corpus | Refusé par la modale à deux dossiers (§7.2, garde exact-égalité) — sinon `sources/audio/` chevaucherait `audio/` du corpus |

## 10. Jalons

1. **J1 — main (cœur du changement)** : `assignerAudio` par référence +
   normalisation `file://`/`path.normalize` ; **bump `FORMAT_VERSION` 2→3 +
   migration silencieuse v2→v3** dans `ouvrir()` (résout les `audioRef` relatifs
   en absolus + **déplace les PNG `audio/` → `png/`**) ; `cheminWaveform(id)`
   (par id, vers `png/`) + `cheminMediaAbs(p)` (whitelist) + cache `refsAudio`
   (Map id→ref) ; `audios()` par référence (scan waveform sur `png/`) ;
   `supprimerEntretien` non destructeur (scan `png/`) ;
   IPC `corpus:verifierAudios`. *Tests unitaires : plus de copie, whitelist
   (positif/négatif), invalidation du cache, migration v2→v3 (audioRef relatifs
   → absolus), suppression qui laisse le fichier source intact.*
2. **J2 — renderer** : `urlMediaAudio` + `urlMediaWaveform` (suppression
   `estRefExterne`, routing par type) ; note de transparence +
   `data-tour="ajouter-entretien"` dans `AjoutEntretien.vue` ; état d'erreur
   « audio introuvable » du lecteur ; basename de l'audio dans l'entête
   entretien (§5.4).
3. **J3 — intégrité** : `audiosManquants` dans le scope + bandeau dans
   `Corpus.vue` ; e2e : déplacer un fichier source → bandeau, app saine.
4. **J4 — démo & pas-à-pas** (§7) : modale à deux dossiers (sources à
   matérialiser + corpus de travail, `defaultPath` dans Documents) ; IPC main
   `demo:copierSources(racine)` ; paramétrage de `demo:lireSource` /
   `demo:cheminAudio` par racine de sources ; `importerSource(k, racineSources)`
   zéro copie ; étape 1 = spotlight sur le vrai bouton + one-click renommé
   « Faire à ma place » (`libelleAction` per-step) + dossier sources dans le
   texte de l'étape ; `defaultPath` des dialogues natifs (§7.4, à trancher §11) ;
   e2e `demo` / `pas-a-pas` / `audio` mis à jour (les assertions « copie
   d'audio dans le corpus » changent → les références pointent vers le dossier
   sources) ; synchronisation du plan-tutoriel (§7.7).
5. **J5 — passe e2e complète** : la suite entière au vert (48 tests actuels +
   nouveaux) ; réouverture d'un corpus v2 (copies relatives) → migration v3
   silencieuse vérifiée par la suite.
6. **v2 (hors périmètre)** : « Sauvegarder le corpus (avec audio) » (zip du
   dossier + copie des audios référencés → portabilité sous demande) ; champ
   `nom` d'affichage si le besoin se montre ; case optionnelle « copier plutôt
   que référencer » dans la modale pour les utilisateurs qui veulent un dossier
   auto-suffisant.

## 11. Points ouverts

- **Cache `refsAudio`** : `Map<id, string>` (couvre whitelist + `audios()`) vs
  `Set<string>` (whitelist seule) — à trancher à l'implémentation. Invariant de
  mutation (§4.1) : si `audioRef` peut être mutée via `ecrireEntretien`, invalider
  le cache là aussi (ou normaliser au write). Revoir si le store change
  d'architecture (multi-corpora ouverts simultanés → cache par-dossier).
- **`defaultPath` des dialogues natifs pendant le pas-à-pas** (§7.4) : sans
  cela, l'objectif « geste réel sur la vraie modale » est partiellement défait
  (le dialogue s'ouvre à un défaut OS, pas dans `racineSources`). Ajouter un
  `defaultPath` optionnel aux IPC `dialog:choisirTexte` / `dialog:choisirAudio` ?
- **Sémantique de recopie idempotente** de `demo:copierSources` (§7.2) :
  fichier-à-fichier (stale possibles) vs clean-then-copy (détruit les modifs
  utilisateur). À trancher.
- **Affichage du chemin complet** : **tranché — écarté** (§12.7) : SonalPi
  l'affiche en clair dans l'entête ; le basename + tooltip (§5.4) a été
  implémenté puis retiré (encombrement de la barre d'entête avec un nom long).
- **Contrat `audios()`** : `waveform: boolean` (plus propre, l'id suffit à
  construire l'URL) vs `waveform: string | null` (garde la forme actuelle, le
  renderer ignore le chemin) — à confirmer (§4.4).
- **Dérivés** : le PNG dans `png/` est la seule dérogation au « l'app n'écrit
  que dans son dossier de travail ». S'il venait à gêner (dossier `png/`
  vide + PNG orphelins), on pourrait renommer `png/` en `derive/` — mais
  pas dans ce plan (rétro-compat des scans).

## 12. Journal d'implémentation

> Section tenue à jour au fil de l'avancement, pour reprendre le travail
> dans une nouvelle session. Les renvois « §X » pointent vers les sections
> ci-dessus. Les chemins sont relatifs à `SonalAsynchro/`.

### 12.1 J1 — main (cœur du changement) — ✅ TERMINÉ

Toutes les modifications ci-dessous compilent (`tsc --noEmit` OK) et les
158 tests unitaires + 48 e2e sont au vert.

**`src/shared/format.ts`**
- `FORMAT_VERSION = 2` → **`3`**.
- En-tête de commentaire mis à jour (paragraphe v3).

**`src/main/corpusStore.ts`** (le cœur du changement)
- Imports : `copyFileSync` **conservé** (toujours utilisé par `tournerBak`),
  ajout de `statSync`, `isAbsolute`, `resolve` (de `node:path`) et
  `fileURLToPath` (de `node:url`).
- Nouveau champ privé `cacheRefsAudio: Map<string, string> | null = null`
  (cache paresseux des `audioRef` du corpus courant).
- Nouveaux getters privés : `pngDir` (`<corpus>/png/`, ex-`audioDir`) et
  `audioDirLegacy` (`<corpus>/audio/`, reliquat des corpus migrés).
- `ouvrir()` : ajout de la branche `if (corpus.formatVersion === 2)` qui
  appelle `migrerV2VersV3(corpus)`, après la branche v1→v2 existante.
- **Nouvelle** `migrerV2VersV3(corpus)` : (1) crée `png/`, déplace les PNG
  `audio/<id>.png` → `png/<id>.png` (idempotent — ne pas écraser un PNG déjà
  migré) ; (2) pour chaque entretien du membership, résout `audioRef` relatif
  en absolu (`resolve(this.dir, ref)`) + bump `formatVersion = 3` ; (3) bump
  le corpus à v3 + `invaliderRefsAudio()`.
- `lireEntretien()` : ajout d'un filet v2→v3 (résolution `audioRef` relatif →
  absolu) après la migration v1→v2 — pour un entretien v2 arrivant isolément
  dans un corpus v3.
- `ecrireEntretien()` : ajout de `this.invaliderRefsAudio()` après l'écriture
  (sécurité : le renderer peut round-triper un `audioRef` modifié).
- `supprimerEntretien()` : scan de `png/` au lieu de `audio/` ; ne déplace
  plus l'audio (jamais copié). Invalide le cache.
- `assignerAudio()` : **ne copie plus**. `audioRef = normaliserCheminAudio(source)`
  (chemin absolu normalisé). Invalide le cache.
- `ecrireWaveform()` : écrit dans `png/<id>.png` (ex-`audio/`).
- `audios()` : waveform = scan de `png/` ; audio = depuis le cache
  `refsAudio()` (audioRef absolu par entretien). Contrat de retour **inchangé**
  (`Record<id, { audio: string | null; waveform: string | null }>`).
- **Nouvelle** `cheminWaveform(id)` : résolution par id (opaque) →
  `<corpus>/png/<id>.png`. Garde : l'id ne doit pas contenir de séparateur
  (`sep` ou `/`). Remplace l'ancienne `cheminMedia(rel)` (supprimée).
- **Nouvelle** `cheminMediaAbs(p)` : whitelist stricte — le chemin normalisé
  doit appartenir aux valeurs de `refsAudio()` + `existsSync`.
- **Nouvelle** `verifierAudios()` : `Record<id, 'ok' | 'manquant'>` pour les
  entretiens dont l'`audioRef` est non-null (intégrité à l'ouverture).
- **Nouvelle** `refsAudio()` : cache paresseux `Map<id, audioRef>` — passe de
  lecture des entretiens partagée entre `cheminMediaAbs` et `audios()`.
- **Nouvelle** `invaliderRefsAudio()` : met `cacheRefsAudio = null`.
- **Nouvel** helper module `normaliserCheminAudio(source)` : `fileURLToPath`
  si `file:` + `normalize`.

**`src/main/index.ts`**
- IPC `corpus:verifierAudios` ajouté.
- Handler `protocol.handle('sonal-media', …)` réécrit : switch sur
  `new URL(req.url).hostname` → `waveform` (id → `cheminWaveform`) ou `abs`
  (chemin encodé → `cheminMediaAbs`). La logique Range/streaming est
  inchangée. Ancien `cheminMedia(rel)` supprimé.
- Commentaires mis à jour (`dialog:choisirAudio`, `demo:cheminAudio`).

**`src/preload/index.ts`**
- `verifierAudios` ajouté à l'API `corpus`.

### 12.2 J2 — renderer — ✅ TERMINÉ

**FAIT :**

**`src/renderer/audio/waveform.ts`**
- `urlMedia(rel, v?)` → **supprimée**. Remplacée par :
  - `urlMediaAudio(audioRef)` → `sonal-media://abs/<encodeURIComponent(audioRef)>` ;
  - `urlMediaWaveform(id, v?)` → `sonal-media://waveform/<id>?v=<v>`.
  L'helper `estRefExterne` prévu initialement n'a **jamais été créé** — le
  routing est par type de ressource (§5.1).
- `genererEtEcrireWaveform` : `fetch(urlMediaAudio(audioRef))`.

**`src/renderer/composables/sonal.ts`**
- Import `urlMedia` → `urlMediaAudio, urlMediaWaveform`.
- `urlWaveform(id)` : utilise `urlMediaWaveform(id, lastModified)`.
- `majAudioEntretien(id)` : `urlMediaAudio(audioRef)` +
  `urlMediaWaveform(id, Date.now())`.
- Commentaire `assignerAudioSelection` mis à jour.
- **Nouvelle** `reassignerAudioEntretienOuvert()` : pour l'entretien ouvert
  (ré-affectation depuis le lecteur en cas d'audio introuvable). Référence le
  nouveau chemin, régénère la waveform, met à jour `ent.meta.audioRef` +
  `majAudioEntretien`. Exposée dans le `return` plat.

**`src/renderer/composables/useAudio.ts`**
- Nouvelle ref `erreur = ref(false)` ; event `error` du `<audio>` la met à
  `true` si une URL est chargée ; `charger()` la reset.
- Exposée dans le `return`.

**`src/renderer/components/LecteurAudio.vue`**
- Template : `v-if="url && !erreur"` pour le lecteur normal, `v-else-if="url &&
  erreur"` pour un état d'erreur affichant « 🔊 Audio introuvable — le fichier
  a peut-être été déplacé. » + un bouton « Assigner un audio… » qui appelle
  `reassignerAudioEntretienOuvert`.
- Destructuration de `erreur` depuis `audio` ; import de
  `reassignerAudioEntretienOuvert` depuis `utiliserSonal`.
- Styles `.lecteur-erreur` / `.msg-erreur` ajoutés.

**`src/renderer/components/AjoutEntretien.vue`**
- `data-tour="ajouter-entretien"` posé sur le bouton « + Ajouter un entretien »
  (§7.4).
- Note de transparence `note-ref-audio` : « L'audio est **référencé, pas
  copié** : le fichier d'origine doit rester à cet endroit. » affichée quand
  `audioChemin` est renseigné (§5.2). Style dédié.

**`src/renderer/components/Entretien.vue`**
- **§5.4 — basename de l'audio dans l'entête : IMPLÉMENTÉ PUIS RETIRÉ (décision
  utilisateur, 2025-08-18).** Une pastille `nom-audio` (libellé « Audio » +
  basename, chemin complet en tooltip, helper local gérant `/` et `\\`) avait
  été posée dans la barre d'entête. **Retirée** : un nom de fichier long
  encombre la barre d'entête (l'ellipse CSS ne suffisait pas à la garantir).
  Le fichier est revenu à l'état antérieur (seuls les `data-tour` du
  plan-tutoriel y figurent). **§5.4 n'est PAS livré** — la transparence
  « référencé, pas copié » reste portée par la note de la modale (§5.2) et le
  bandeau d'intégrité de J3 (§6). Voir §12.7.

### 12.3 J3 — intégrité — ✅ TERMINÉ

**`src/renderer/env.d.ts`**
- `verifierAudios: () => Promise<Record<string, 'ok' | 'manquant'>>` ajouté au
  typage de l'API `corpus` — le preload l'exposait depuis J1 mais le typage
  renderer ne l'avait pas suivi (manquait pour le renderer).

**`src/renderer/composables/sonal.ts`**
- Nouvelle ref `audiosManquants = ref<Record<string, 'manquant'>>({})` — ids des
  entretiens dont l'audio RÉFÉRENCÉ est introuvable. Ref placée près de
  `audiosCorpus` (le plan hésitait « useCorpus » : tout le scope audio/corpus
  vit déjà dans `sonal.ts`).
- Nouvelle `verifierIntegriteAudios()` : appelle
  `window.sonal.corpus.verifierAudios()` (IPC batché main, cache `refsAudio`)
  et ne retient que les `'manquant'`.
- `appliquerCorpus()` : `audiosManquants.value = await verifierIntegriteAudios()`
  juste après `rafraichirAudios()` — calculé à CHAQUE ouverture, réinitialisé
  par construction (pas de bandeau d'un corpus précédent). Jamais rafraîchi en
  session (décision §6) : seul le lecteur (§5.3) rattrape au cas par cas.
- Exposée dans le `return` plat.

**`src/renderer/components/Corpus.vue`**
- Bandeau `bandeau-audio` (data-tour) AU-DESSUS des cartes, affiché si
  `Object.keys(audiosManquants).length > 0` : « ⚠️ N fichier(s) audio
  introuvable(s) — déplacé(s) ou supprimé(s) ? » + liste des entretiens
  concernés (titre depuis le membership). Clic sur un entretien =
  `ouvrirEntretien(id)` → le lecteur affiche « Audio introuvable » +
  « Assigner un audio… » (ré-assignation §5.3, livrée en J2).

**e2e (`e2e/audio.e2e.ts`)**
- Nouveau test « J3 : audio référencé supprimé après assignation → bandeau
  d'intégrité à l'ouverture, app fonctionnelle » : assigner un WAV à
  « Entretien Karine » → `rmSync` du fichier SOURCE → Accueil → ré-ouvrir le
  corpus → bandeau visible avec le bon titre ; clic sur l'entretien du bandeau
  → lecteur en état « Audio introuvable » + bouton de ré-assignation ; le
  texte reste ÉDITABLE (on ne crash jamais pour un média manquant).

### 12.4 J4 — démo & pas-à-pas — ✅ TERMINÉ

**`src/main/index.ts`**
- `dialog:choisirTexte(defaultPath?)` / `dialog:choisirAudio(defaultPath?)` :
  paramètre optionnel passé à `showOpenDialog` — point ouvert §11 TRANCHÉ
  (§7.4) : pendant une session démo, le dialogue natif s'ouvre dans
  `racineSources` (sinon comportement inchangé).
- **Nouveau** `dialog:choisirDossier(kind?: 'sources' | 'corpus')` : picker de
  DOSSIER PUR (aucun effet de bord sur le store) ; `defaultPath` =
  `Documents/Sonal/démo/<kind>` (désamortit le geste, modifiable).
- **Nouveau** `demo:copierSources(racine)` : copie récursive
  `cheminCorpusTest()` → racine (`cpSync`, idempotent) — **LA seule copie** du
  flow de démo (~13 Mo, §7.2).
- `demo:lireSource(rel)` → `demo:lireSource(racine, rel)` ;
  `demo:cheminAudio(rel)` → `demo:cheminAudio(racine, rel)` — racine
  paramétrable (les sources sont matérialisées, plus bundled).

**`src/preload/index.ts`** / **`src/renderer/env.d.ts`**
- `choisirDossier`, `copierSources` ajoutés ; `lireSource`/`cheminAudio` à deux
  params ; `choisirTexte`/`choisirAudio` avec `defaultPath?`.

**`src/renderer/composables/demo.ts`** (le cœur)
- Refs `racineSources` / `dossierCorpus` (session) — mémorisées par la modale,
  réutilisées par les textes/actions des étapes et par une re-préparation sans
  2ᵉ modale (bascule pas-à-pas ⇄ autonomie, §7.5).
- `importerSource(k, racine)` — lit le SRT et RÉFÉRENCE l'audio dans la racine
  (zéro copie).
- `preparer(mode, opts?)` : opts = `{ racineSources, dossierCorpus }` fournis par
  la modale (ou re-utilisés si déjà posés) ; copie des sources →
  `corpus:ouvrirDossier(dossierCorpus)` (amorce si neuf, équivalent du picker
  sans dialogue) → peuplement (autonomie) → `appliquerCorpus`.
- Étape 1 « Charger un entretien » : `cible: () => '[data-tour="ajouter-entretien"]'`
  (le VRAI bouton, §7.4), `libelleAction: 'Faire à ma place : importer Sylvie'`,
  texte qui cite `racineSources`.
- `EtapePasAPas` : + `libelleAction?: string`.

**`src/renderer/components/ModaleDemo.vue`** (nouveau)
- Modale à DEUX questions (façon SonalPi `nouveau_corpus.html`) : « Où
  voulez-vous placer les sources de la démo ? » puis « Où voulez-vous placer le
  corpus de travail ? » (§7.2). Garde : dossiers distincts (refus si identiques).
  Valider désactivé tant que les deux ne sont pas choisis ; `defaultPath` des
  pickers hinté par `dialog:choisirDossier(kind)`. À la validation →
  `preparer(mode, { racineSources, dossierCorpus })`.

**`src/renderer/components/Accueil.vue`**
- Cartes démo → `lancerPreparer(mode)` : modale si pas encore de `racineSources`
  en session, sinon re-préparation DIRECTE (bascule §7.5, pas de 2ᵉ modale).
- `<ModaleDemo v-if="modaleDemo" :mode="modaleDemo" @fermer="modaleDemo = null" />`.

**`src/renderer/components/PasAPas.vue`**
- Bouton one-click : `{{ etapeCourante.libelleAction ?? "Charger l'entretien" }}`
  (`libelleAction` per-step).
- **Bug corrigé au passage** : les styles du spotlight étaient en `:deep()` →
  ils ne s'appliquaient PAS au contenu téléporté en body (`position: static`,
  `z-index: auto` — le trou/la bulle n'étaient jamais positionnés ; les anciens
  tests ne vérifiaient pas la position). Passés en `:global()` → le trou
  encadre réellement la cible (déterminant pour §7.4).

**`src/renderer/components/AjoutEntretien.vue`**
- `choisirTexte`/`choisirAudio` passent `racineSources` en `defaultPath` quand
  posée (point ouvert §11 tranché, §7.4) — le geste réel de l'étape 1 s'ouvre
  dans les sources matérialisées.

**e2e**
- `demo.e2e.ts` : stubs des DEUX pickers (sources + corpus) ; assertions §7.6 :
  (i) les sources sont COPIÉES dans le dossier choisi (`srt/` + `audio/`
  intacts) ; (ii) AUCUNE copie d'audio dans le corpus (seuls les PNG d'onde
  dans `png/`) ; (iii) les `audioRef` = chemins ABSOLUS dans le dossier sources.
- `pas-a-pas.e2e.ts` : étape 1 → trou qui CHEVAUCHE le vrai bouton
  (`data-tour="ajouter-entretien"`) + one-click « Faire à ma place » ;
  **nouveau** test « geste RÉEL » : la vraie modale (srt + mp3 choisis dans les
  sources) valide le même prédicat.

### 12.5 J5 — passe e2e complète — ✅ TERMINÉ

- **FAIT** : 51/51 e2e au vert avec le code J1+J2+J3+J4+J5 (suite relancée
  2025-08-18 après J5, `npx playwright test` — 19,6 s). `audio.e2e.ts` adapté au
  nouveau modèle (helper `fichiersAudioDansCorpus` qui vérifie l'absence de
  copie + `fichiersPngDuCorpus` qui vérifie le PNG dans `png/`).
- **NOUVEAU** `e2e/migration.e2e.ts` : corpus v2 (copies RELATIVES) écrit sur
  disque AVANT le lancement → à l'ouverture, migration silencieuse vérifiée au
  niveau fichier (bump corpus + entretien à v3, `audioRef` résolu en absolu
  vers l'emplacement legacy, PNG `audio/` → `png/`, aucun orphelin), lecteur
  qui joue l'audio migré (whitelist `cheminMediaAbs` sur le chemin migré) et
  réouverture idempotente. C'était le dernier point manquant de la passe.

### 12.6 Tests — état

**Unitaires (`npx vitest run`) : 158/158 au vert.**
- `test/corpusStore.test.ts` : 26 → **36 tests** (adaptation `formatVersion`
  2→3 + 10 nouveaux) :
  - `CorpusStore — audio par RÉFÉRENCE (v3)` : assignerAudio ne copie pas,
    whitelist cheminMediaAbs (positif/négatif), cheminWaveform (id + anti-
    traversal), cache invalidé par assigner/supprimer, audios(),
    verifierAudios().
  - `CorpusStore — migration v2→v3` : audioRef relatif→absolu + PNG
    `audio/`→`png/` + bump ; idempotence ; audioRef null reste null.
  - Test cycle de vie : adapté (l'audio externe n'est pas déplacé en corbeille,
    le PNG oui).
- `test/seedDemo.ts` : `formatVersion` 2→3 pour `corpus` et `e1`.
- Autres fichiers de test inchangés (passent tel quel).

**e2e (`npx playwright test`) : 51/51 au vert.**
- `e2e/migration.e2e.ts` (**nouveau**) : corpus v2 écrit avant lancement →
  migration silencieuse à l'ouverture (bump v3, `audioRef` relatif → absolu,
  PNG `audio/` → `png/`), lecteur jouable sur le chemin migré, idempotence à la
  réouverture.
- `e2e/audio.e2e.ts` : helper `fichiersAudioDuCorpus` → `fichiersPngDuCorpus`
  (scan `png/`) + `fichiersAudioDansCorpus` (scan `audio/`, doit être vide).
  Assertions mises à jour : `.wav` n'est plus copié, `.png` est dans `png/`.
- Autres fichiers e2e inchangés (passent tel quel).

### 12.7 Décisions tranchées pendant l'implémentation

- **Cache `refsAudio` (point ouvert §11)** : `Map<id, string>` (recommandation
  appliquée). Couvre whitelist `cheminMediaAbs` ET `audios()`.
- **Invariant `audioRef` (§4.1)** : `ecrireEntretien` invalide le cache par
  sécurité (le renderer round-tripe la valeur). L'invariant « muté uniquement
  via `assignerAudio` » reste visé mais non vérifié à l'écriture.
- **Contrat `audios()` (point ouvert §11)** : **gardé `waveform: string | null`**
  (pas `boolean`) pour ne pas casser les types existants (`audiosCorpus` dans
  `sonal.ts`, preload). Le renderer ignore le chemin du waveform au profit de
  l'id dans `urlMediaWaveform(id, …)` — le `string | null` est conservé pour la
  rétro-compat du contrat, le `boolean` n'apportait rien de plus. Point ouvert
  §11 à confirmer ou clôturer.
- **`estRefExterne`** : **jamais créé** — le routing par type de ressource
  (audio → `abs`, waveform → `waveform`) rend l'helper inutile (§5.1 corrigé).
- **§5.4 basename dans l'entête (point ouvert §11 « Affichage du chemin
  complet »)** : **ÉCARTÉ** — implémenté (pastille `nom-audio` dans la barre
  d'entête d'`Entretien.vue`), puis **retiré sur décision utilisateur**
  (2025-08-18) : un nom de fichier long encombre la barre d'entête, même avec
  ellipse. La transparence du modèle « référencé, pas copié » reste portée par
  la note de la modale (§5.2) et le bandeau d'intégrité (§6) — pas besoin
  d'une présence permanente dans l'entête. §5.4 est marqué **non livré** ;
  J2 reste terminé (le périmètre livré est J2 − §5.4).
- **`defaultPath` des dialogues natifs (point ouvert §11, §7.4)** : **TRANCHÉ**
  — `dialog:choisirTexte` / `dialog:choisirAudio` acceptent un `defaultPath`
  optionnel, hinté `racineSources` par `AjoutEntretien` pendant une session
  démo. Le geste réel de l'étape 1 du pas-à-pas s'ouvre dans les sources
  matérialisées (plus de défaut OS aveugle).
- **Sémantique de `demo:copierSources` (§7.2/§11)** : **fichier-à-fichier** via
  `cpSync` (écrase, idempotent) — les modifs utilisateur dans `racineSources`
  ne sont PAS détruites (pas de clean-then-copy).
- **`PasAPas.vue` : `:deep()` → `:global()`** — bug latent corrigé : les
  sélecteurs scoped `:deep()` ne matchent PAS le contenu téléporté en body
  (`position: static`, `z-index: auto` → le trou/la bulle n'étaient jamais
  positionnés ; les anciens tests ne vérifiaient pas la position). En
  `:global()` le trou encadre réellement la cible — déterminant pour §7.4.
- **Marqueur `demo: true` (plan-tutoriel §12.3)** : **PAS posé** — le builder
  actuel ne le posait pas non plus (gardien « mêmes que le builder actuel »).

### 12.8 Commandes utiles pour reprendre

```bash
cd SonalAsynchro
npx tsc --noEmit                    # vérif types (main + renderer + shared)
npx vitest run                      # 158 tests unitaires
npm run build                      # build prod (requis avant e2e)
npx playwright test                # 51 tests e2e
npx playwright test e2e/audio.e2e.ts --reporter=line  # sous-ensemble
```
