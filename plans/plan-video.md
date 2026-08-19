# Plan — Lecture d'entretiens vidéo — SonalAsynchro

> Ouvrir un entretien dont le fichier source est une **vidéo** (mp4, webm…) et le traiter
> comme aujourd'hui : synchro temporelle ancrée dans le texte, waveform, codage, données,
> journal, export. La particularité : une **organisation d'écran propre à la vidéo** (barre
> d'écoute + waveform empilées en haut à gauche, **vidéo épinglée et redimensionnable à leur
> droite**, éditeur texte dessous sur toute la largeur), et — au démarrage **pas plus loin
> que nécessaire** — la récupération de la piste sonore pour la waveform. Difficulté globale :
> **moyenne**, bien découpable ; deux points à valider tôt sur un vrai fichier (décodage de la
> piste audio d'un container vidéo, §4) et le placement exact du panneau vidéo (§2.1).

---

## 1. Ce qui existe déjà (l'essentiel est réutilisable)

- **La synchro est temporelle et sans format.** Le temps est porté par des **ancres**
  (`{pos, t}`, `shared/entretien/audio.ts`), projetées dans le texte. Toute la lecture
  (surlignage du bloc lu, seek clic-tour) part du `currentTime` d'un élément média.
  Un `<video>` expose **exactement la même API** qu'un `<audio>` (play/pause, currentTime,
  duration, playbackRate, timeupdate) → **la synchro vidéo ne demande aucun changement
  de modèle**.
- **Le média est référencé, jamais copié** : l'entretien stocke un chemin de fichier
  (`audioRef`) ; le protocole `sonal-media://abs/<encoded>` sert le fichier d'origine, MIME
  résolu par extension (`src/main/index.ts`). Un fichier vidéo se sers déjà par ce chemin —
  il ne manque que des MIME/extension vidéo.
- **La waveform est un dérivé régénérable et non fatal** (`<corpus>/png/<id>.png`,
  `renderer/audio/waveform.ts`) : `decodeAudioData` sur les octets du fichier ; en échec, la
  bande s'affiche **sans onde** et l'app continue. Cette philosophie s'étend telle quelle.
- **L'écran Entretien est déjà découpé** (barre d'actions pleine largeur + colonne de gauche
  épinglée + éditeur, `Entretien.vue`) — la variante vidéo en est une **réorganisation
  conditionnelle** de la zone de droite.
- **Un fichier de préférences existe** : `lireSettings`/`ecrireSettings` (`main/index.ts`)
  porte déjà `recents` + mémoire démo — la taille mémorisée de la vidéo (par corpus, D6) y
  entre de la même façon.

## 2. Cible

### 2.1 Vue vidéo (variante conditionnelle de l'écran entretien)

```
[  ← Corpus    (aide)                  Enregistrer    Exporter .sonal ]   ← barre d'actions (épinglée)
┌──────────────────────┬───────────────────────────────────────────────┐
│ Loc│Thèmes│Données│  │  [ ▶ barre d'écoute ]   [ ─── + ]              │
│ Journal              │  [   waveform        ]   [ VIDÉO ]             │   ← zone média (épinglée)
│                      │  [                  ]   [ 16:9  ]             │      lecteur+waveform ‖ vidéo
│                      │  [                  ]                          │
│  (panneau de         ├───────────────────────────────────────────────┤
│   l'onglet actif)    │              ÉDITEUR TEXTE (défile)             │
│                      │                                               │
│  colonne de gauche   │                                               │
│  UNE SEULE colonne,  │                                               │
│  épinglée, pleine    │                                               │
│  hauteur             │                                               │
└──────────────────────┴───────────────────────────────────────────────┘
```

- **Colonne de gauche pleine hauteur** (Loc / Thèmes / Données / Journal + panneau actif),
  inchangée et **épinglée**, comme en audio.
- La zone de droite (la variante vidéo) : **barre d'écoute puis waveform empilées** à
  gauche, **panneau vidéo à leur droite** — côte à côte, pour laisser au texte le maximum
  de **hauteur** sous l'ensemble. Le **lecteur/waveform ne sont jamais écrasés** : largeur
  **minimale** réservée (flex `none`), la vidéo a une **largeur max** qui l'empêche de
  déborder sur eux. La **hauteur** de la vidéo découle de son **ratio réel** (4:3, 16:9…
  via `videoWidth/videoHeight`).
- **Vidéo épinglée**, comme la barre d'écoute et la waveform : toujours visible pendant que
  l'éditeur défile. **Redimensionnée par boutons `−` / `+`** (largeur), taille **mémorisée
  par corpus** (D6).
- **Éditeur texte en dessous, pleine largeur**, qui défile.
- **Synchro conservée** : le `<video>` est l'horloge ; le **double-espace play/pause**
  (même geste que l'audio) fonctionne à l'identique — même scope média.
- Quand le média est **audio**, la présentation actuelle ne change pas : la variante vidéo
  n'est active que si le média est une vidéo.

### 2.2 Au chargement d'un entretien vidéo

Flux « dérivé, non bloquant » (même esprit que la waveform) :

1. Détecter que le média est une vidéo (extension/MIME).
2. **Piste sonore — seulement si c'est SIMPLE** : essayer le **décodage direct** (mp4/webm
   usuels → instantané, aucune attente). **Aucune extraction élaborée n'est actée** (§4).
3. **Si le décodage réussit** : enchaîner sur le pipeline existant pour générer la waveform.
   **Sinon** : avertir l'utilisateur (un petit message) et il **travaille sans waveform** — la
   bande reste un **rectangle** portant le **calque des annotations thématiques** (c'est déjà
   le comportement actuel de la bande sans onde : les segments du résumé s'y dessinent).
   Rien ne bloque : le codage, la synchro et la lecture restent pleinement fonctionnels.

## 3. Décisions de conception

| Décision | Choix retenu | Justification |
|---|---|---|
| **D1 — Type de média** | Détection par **extension/MIME** au chargement ; le champ existant (chemin) n'est pas renommé | Aucune migration ; le fichier est déjà servi par `sonal-media://abs/` |
| **D2 — Élément de lecture** | Scope média élargi : `<audio>` (cas actuel) **ou** `<video>` visible (cas vidéo), mêmes refs réactifs, même `basculer()` | API identique → `useAudio` devient `useMedia` sans changer le contrat |
| **D3 — Double-espace play/pause** | Activé pour la vidéo comme pour l'audio (même `basculer()`) | Trivial : c'est le même scope média |
| **D4 — Organisation vidéo** | Variante conditionnelle dans `Entretien.vue` : barre+waveform (gauche, largeur min) ‖ panneau vidéo (droite) par-dessus, éditeur pleine largeur dessous | Réutilise barre, onglets, journal, codage tels quels ; max de hauteur pour le texte |
| **D5 — Redimensionnement** | **Boutons `−`/`+`** réglant la **largeur** du panneau vidéo ; **hauteur déduite du ratio** de la vidéo (4:3, 16:9…) via `videoWidth/videoHeight`, plafonnée pour rester dans la zone épinglée | Plus simple, comme demandé ; n'écrase pas le lecteur grâce aux largeurs min/max ; s'adapte d'office à tout ratio |
| **D6 — Persistance de la taille** | **Par corpus** : clé dans `Settings` (ex. `taillesVideo[<corpus>]`) ; **largeur par défaut déduite du ratio** (4:3 vs 16:9) quand aucune préférence n'existe | Indique des fichiers de volumes différents d'un corpus à l'autre ; aucune largeur arbitraire au 1er usage |
| **D7 — Épinglage** | Barre d'écoute, waveform et vidéo collantes (même patron sticky que l'audio, calé via `--entete-h`/`--barre-h`) | « Toujours voir la vidéo » est un prérequis produit |

## 4. Piste sonore d'une vidéo : SIMPLE seulement

`genererWaveformPng` décode avec `AudioContext.decodeAudioData`, qui **décode la piste audio
d'un container vidéo de façon non garantie** : **ça marche sur les formats courants**
(mp4/AAC, webm/Opus — Chromium/Electron les décode), **ça échoue ou dégrade** sur d'autres
(mkv, mov exotiques, certains codecs). **Règle retenue : on ne fait que ce qui est simple.**

- **SIMPLE — décodage direct (seul niveau acté)** : donner les octets de la vidéo à
  `decodeAudioData`. **Aucune extraction à écrire, aucune attente** (mp4/webm usuels) — le
  pipeline waveform existant s'utilise tel quel. À *valider* en J2 sur une vraie vidéo test.
- **PAS SIMPLE — on ne le fait pas** : si le décodage échoue, **on avertisse l'utilisateur**
  et il travaille **sans waveform**. La bande reste un **rectangle avec le calque des
  annotations thématiques** (déjà fourni par `LecteurAudio.vue` : les segments du résumé s'y
  dessinent, avec ou sans onde) — on n'investit donc aucun extracteur pour un visuel optionnel.

**Évaluation de ffmpeg.wasm (demandée)** : pertinent pour « tous les formats, sans binaire »,
mais il **charge le fichier entier en mémoire WASM** (heap 32 bits, plafond ≈ 2–4 Go) → mal
adapté aux **gros enregistrements** ; plus lent que le natif (mono-thread) ; ~25–30 Mo de core
wasm (à vérifier) ; licence FFmpeg (LGPL/GPL) à valider. Et surtout : la **lecture** passe déjà
par le décodeur natif de Chromium — ffmpeg ne servirait qu'à la **waveform**, un visuel
optionnel. **Verdict : ffmpeg.wasm n'est PAS retenu** — et, au titre de « simple seulement »,
aucun extracteur (ni MediaRecorder, ni binaire natif) n'est engagé au démarrage.

**Acté sans condition** : la piste sonore n'est qu'un **dérivé pour la waveform** — rien de
binaire dans le modèle ni la persistance de l'entretien ; et si la waveform n'est pas possible,
l'app est **pleinement fonctionnelle sans elle** (bande rectangle + calque).

## 5. Étapes de travail (ordre proposé, avec complexité estimée)

> Estimation indicative, jalons cumulables et testables séparément. Risque global faible :
> les deux points incertains (décodage de la piste, placement) sont neutralisés par le
> repli « sans waveform » et par une validation visuelle dès J4.

- **J1 — Détection + service vidéo** (complexité : **faible**) : extensions vidéo
  (`EXT_VIDEO`) et MIME dans `src/main/index.ts`, filtre du dialogue élargi ; détection du
  type dans le renderer. *L'entretien vidéo s'ouvre et se lit en `<audio>`* (avant toute
  refonte d'écran) — on valide la **synchro** sur une vraie vidéo test, rien de plus.
- **J2 — Pipeline waveform vidéo — décodage direct** (complexité : **faible**) : brancher
  un média vidéo sur la charge waveform existante ; si `decodeAudioData` échoue → **avertir +
  bande rectangle** (pas d'extraction). On valide sur la vidéo test la branche « ça marche »
  ou « ça replie proprement ».
- **J3 — Scope média unique (audio ↔ video)** (complexité : **moyenne**) : `useAudio.ts` →
  `useMedia` ; un `<video>` visible en mode vidéo remplace l'`<audio>` caché ; même
  `basculer()`, même vitesse/seek. C'est le cœur du refactor, mais l'API est identique.
- **J4 — Layout vidéo** (complexité : **moyenne**) : grille d'écran conditionnelle dans
  `Entretien.vue` — barre+waveform à gauche (largeur min), **panneau vidéo**
  (`VideoPanel.vue`) à droite, éditeur pleine largeur dessous, tout épinglé ; **ratio
  (4:3 / 16:9) depuis `videoWidth/videoHeight`** et largeur par défaut déduite. Validation
  visuelle du placement (§2.1).
- **J5 — Redimensionnement + persistance** (complexité : **faible–moyenne**) : boutons
  `−`/`+` (largeur, hauteur = largeur/ratio, min/max), mémorisation **par corpus** (D6),
  relecture au chargement.
- **J6 — Double-espace play/pause + tests e2e** (complexité : **faible** pour le geste,
  **moyenne** pour les tests) : lever le geste sur la vidéo ; tests (ouverture vidéo, synchro,
  waveform ou repli, redimensionnement/persistance, bascule audio/vidéo sans régression) —
  `e2e/audio.e2e.ts`, `navigation.e2e.ts`.

Effort total estimé : **≈ 5–8 jours** (J1–J2 ≈ 1–2 j, J3 ≈ 1–2 j, J4 ≈ 1–2 j, J5 ≈ 1 j,
J6 ≈ 1 j).

## 6. Acceptation

- Une vidéo de **format courant** s'ouvre, **le texte se surligne en suivant image et son**,
  le seek clic-tour et le **double-espace play/pause** fonctionnent ;
- la **waveform** est générée **sans attente** (décodage direct) et son calque thématique
  suit le codage ; **si le décodage échoue**, un message l'indique et la bande reste un
  **rectangle avec le calque des annotations** — l'app reste pleinement utilisable ;
- la **vidéo épinglée** reste visible au défilement, sa taille se règle par `−`/`+` et
  **se souvient par corpus** d'une session à l'autre, **sans écraser le lecteur/waveform** ;
- la vue **audio** et le set existant (codage, données, journal, thèmes, export `.sonal`)
  **ne régressent pas** (e2e actuels verts).

## 7. Points à trancher (au démarrage)

1. **Obtenir une petite vidéo test** (mp4 de préférence) pour valider dès J1–J2 que la
   lecture, la synchro et le `decodeAudioData` fonctionnent — et pour juger du rendu J4.
2. **Largeurs min/max** du panneau vidéo (défauts raisonnables : ex. 320–1400 px, hauteur
   plafonnée pour tenir dans la zone épinglée) — à caler au premier essai réel.
3. **Le renommage « Assigner un audio… » → « Assigner un média… » est DIFFÉRÉ** : il se fera
   après réalisation du plan (une fois la vidéo réellement prise en charge).
4. **Ratio vidéo** : la largeur par défaut est déduite de `videoWidth/videoHeight` (4:3,
   16:9…) — à valider visuellement.

## 8. Non-objectifs (relégués)

- **Extracteur robuste tous-formats** (binaire ffmpeg natif, ou ffmpeg.wasm si fichiers
  petits et aucun binaire souhaité) — non engagé : on ne fait que ce qui est simple (§4),
  le repli est « avertir + bande rectangle ».
- **ffmpeg.wasm** — non retenu au premier jet (mémoire sur gros fichiers, §4).
- **Drag souris** pour redimensionner — en option après les boutons `−`/`+`.
- **Renommage « Assigner un média… »** — différé après réalisation du plan (§7).
- **Corpus vidéo** (navigation/onsets au niveau corpus) — on ne traite ici que la **lecture
  d'un entretien** vidéo.
- **Multi-pistes** (sous-titres incrustés, choix de piste audio) — hors périmètre.
