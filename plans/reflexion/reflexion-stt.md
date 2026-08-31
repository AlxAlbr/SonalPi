# Réflexion STT — transcription vocale au fil de l'eau dans SonalPi2

> Document de **réflexion**, pas un plan d'exécution : il synthétise une exploration sur la
> faisabilité d'une transcription vocale **locale et au fil de l'eau** dans SonalPi2
> (dicter un entretien dans l'éditeur), en partant du test du raccourci Ctrl+Espace et de
> l'essai de l'app Murmure. Aucun code n'a été modifié ; les repos Murmure et parakeet.cpp
> ont été clonés en lecture seule dans `/tmp` pour analyse.

---

## 1. Contexte : du raccourci Ctrl+Espace à la transcription vocale

1. Le geste « double-espace → play/pause » (hérité de SonalPi1) a été testé en **Ctrl+Espace**
   dans l'éditeur ([useEntretien.ts](../../src/renderer/composables/useEntretien.ts)) puis **annulé**
   (test seulement, choix non définitif).
2. L'essai de **Murmure** (STT locale, raccourci Ctrl+Espace) a montré l'intérêt d'une dictée
   vocale directe dans l'app — et ses limites (voir §2).
3. Piste explorée : remplacer le « bricolage » Murmure par une intégration de **parakeet.cpp**
   + un modèle Parakeet, pour une **transcription au fur et à mesure** (streaming).

Cible produit potentielle : le cas « **audio seul → entretien au texte vide à taper** »
(déjà couvert par l'E2E [S6 rev.](../../e2e/audio.e2e.ts)) et, plus largement, dicter un
entretien dans l'éditeur avec le micro, structure de document respectée (blocs, locuteurs).

## 2. Murmure : ce que c'est, et pourquoi c'est du bricolage

**Point important : Murmure n'utilise pas parakeet.cpp.** C'est une app **Tauri/Rust** qui
charge le modèle **Parakeet TDT 0.6B v3 en ONNX Runtime embarqué** (crate `ort`, CPU, modèle
`.onnx` int8). Architecture (dans `src-tauri/`) :

| Brique | Solution Murmure |
|---|---|
| Raccourci global Ctrl+Espace | `rdev` (X11), portail GlobalShortcuts (Wayland), accessibilité macOS, API native Windows |
| Micro | `cpal` → PCM 16 kHz mono |
| Segmentation | VAD **RMS maison** (`AdaptiveVad`) + découpage en segments |
| Inférence | ONNX Runtime par segment ; « streaming preview » = **ré-inférence de tout l'audio accumulé toutes les ~30 ms** |
| Écriture du texte | **Frappe simulée** (`enigo`) dans la fenêtre focalisée + fallback presse-papiers |

**Pourquoi c'est du bricolage pour Sonal** : Murmure tape à l'aveugle dans n'importe quelle
fenêtre. Il ignore tout de la structure du document (blocs/tours, locuteurs, ancres,
timestamps). Une intégration native dans Sonal remplacerait cette frappe simulée par une
**insertion structurée** dans l'éditeur ProseMirror — et permettrait d'**enregistrer l'audio**
du micro (pour réécoute), ce qu'une app externe ne peut pas faire.

## 3. parakeet.cpp : le moteur candidat

- **Port C++17** des modèles Parakeet (NVIDIA NeMo) sur **ggml**. **Licence MIT**. Binaires
  **précompilés par release** : Linux x64 (cpu/vulkan/cuda), macOS arm64 (metal) / x64, Windows x64.
- **Trois surfaces** :
  - **CLI** `parakeet-cli` : transcription fichier/stdin, timestamps, JSON, `--stream` ;
  - **C-API** (`libparakeet.so`, conçue pour dlopen/FFI) : transcribe PCM, batch, n-best, et
    **API streaming** ;
  - **Serveur OpenAI-compatible** : inadapté ici (one-request-at-a-time, upload de fichier WAV,
    pas de streaming live). Pour un vrai service : LocalAI embarque parakeet.cpp via la C-API.
- **C-API streaming** (pilier du besoin) : `stream_begin` / `stream_feed` / `stream_finalize` —
  on nourrit des blocs **PCM mono 16 kHz**, on reçoit le **texte finalisé** incrémentalement
  plus les événements **EOU** (fin d'énoncé) / **EOB** (backchannel), avec timestamps par mot
  (`stream_feed_json`).

**Nuances à connaître**

- Le CLI `--stream` **lit d'abord tout le WAV** (fichier ou stdin complet) puis imprime le texte
  au fil du traitement : ce n'est pas une alimentation continue. Le vrai flux incrémental passe
  par la **C-API**.
- « Au fur et à mesure » = les **mots/énoncés se finalisent en continu** (cache-aware streaming,
  identique à NeMo). Ce n'est **pas** une hypothèse live qui réécrit le passé (c'est la technique
  de Murmure : ré-inférence glissante sur fenêtre). Pour de la dictée, la version parakeet est en
  fait la meilleure UX : **texte stable**, pas de retour arrière.

## 4. Modèles pertinents pour le français

| Modèle | Streaming | Français | Poids (q8_0 / q4_k) | Licence |
|---|---|---|---|---|
| `parakeet-tdt-0.6b-v3` | non (offline) | oui (25 langues européennes) | 904 / 675 Mo | CC-BY-4.0 |
| `parakeet_realtime_eou_120m-v1` | oui (EOU) | **non (anglais)** | 176 / 129 Mo | NVIDIA (autre) |
| `nemotron-3.5-asr-streaming-0.6b` | oui (EOU) | oui (40+ locales, `--lang fr`) | 984 / 718 Mo | NVIDIA (autre) |

→ Le candidat pour une dictée française au fil de l'eau est le **nemotron streaming 0.6B**
(q8_0 ≈ 1 Go, ou q4_k ≈ 720 Mo). Le petit EOU 120M est hors sujet (anglais). Tous sont publiés
en GGUF par le projet ([mudler/parakeet-cpp-gguf](https://huggingface.co/mudler/parakeet-cpp-gguf)).

## 5. Deux chemins d'intégration (et leur complexité)

Contexte : SonalPi2 est **100 % JS/TS, zéro module natif** (Electron + Vue + TipTap) —
un atout de portabilité que l'intégration STT bouscule différemment selon le chemin choisi.

### Chemin A — CLI sous-processus (le plus simple)

- Livrer `parakeet-cli` + le `.gguf` dans `resources/` (`extraResources`), **spawn** depuis le main.
- Dictée **par segments VAD** : segment → `transcribe --input -` (stdin) ou fichier temporaire.
  Latence par énoncé, très basse sur CPU.
- **Piège** : le modèle est **rechargé à chaque appel** (~1 s + ~1 Go RAM) → process persistant
  (petite boucle qui lit des segments par stdin) ou latence acceptée.
- **Aucune toolchain native, aucun module Node** : l'app reste JS pur, le binaire est un asset.
- Effort : **quelques jours** pour un MVP (VAD + segment + transcribe + insertion au curseur).

### Chemin B — C-API via bindings natifs (le vrai streaming)

- Build `libparakeet.so` (`-DPARAKEET_SHARED=ON`) par plateforme, livrée dans `resources/`.
- Chargée depuis le main par **FFI (koffi)** ou un **addon N-API** (node-gyp + electron-rebuild).
- Micro renderer (`getUserMedia` + AudioWorklet → PCM float32 16 kHz) → IPC → `stream_feed` →
  texte finalisé + EOU remontés par événements.
- C'est la voie **propre et efficace** (cache-aware, pas de ré-encodage), mais elle **rompt le
  zéro-natif** du projet. Effort : **~1–2 semaines**.

### Briques communes aux deux chemins (le vrai travail produit)

- **Micro + permissions** : `getUserMedia` standard, mais Electron exige un
  `session.setPermissionRequestHandler` et les droits OS (PulseAudio/PipeWire sous Linux ;
  entitlement microphone sous macOS).
- **Interaction** : push-to-talk (**Ctrl+Espace maintenu**, cohérent avec le test de départ)
  vs **VAD** auto vs segmentation par **EOU**. Murmure a un VAD RMS simple ; Silero est plus
  robuste.
- **Insertion dans le document** : chaque énoncé devient un **bloc/tour** (avec timestamp ?),
  insertion au curseur ou en fin, locuteur courant — le modèle d'ancres existe déjà
  ([useEntretien.ts](../../src/renderer/composables/useEntretien.ts)).
- **Enregistrement audio** : pour pouvoir réécouter, il faut aussi **sauver le WAV du micro**
  → il devient l'`audioRef` de l'entretien (le cas « audio seul » du S6 rev. existe déjà).
- **Distribution** : + 700 Mo à 1 Go de modèle — téléchargé au premier lancement ou embarqué
  dans l'installeur.

## 6. Zéro natif vs natif : où passe la frontière ?

« Zéro natif » aujourd'hui = **rien n'est compilé contre le runtime** : tout tourne dans la VM
JavaScript, `npm install && npm run dev` fonctionne partout. Un **addon natif** (N-API/node-gyp)
est un binaire `.node` **chargé dans le process Electron lui-même** (même mémoire, même V8) :

| | CLI (sous-processus) | Addon N-API / FFI |
|---|---|---|
| Toolchain C++ dans le projet | non | oui (ou prebuilds tiers à vérifier) |
| Matrice de build CI | un binaire par OS (déjà publié) | binaire par OS **+** compat version Electron |
| Chargement dans le process de l'app | non | oui (crash du moteur = crash de l'app) |
| `electron-rebuild` à chaque maj Electron | jamais | à valider à chaque maj |

- **Electron ≠ Node** : Electron embarque son propre runtime (ABI `NODE_MODULE_VERSION`
  différente) ; un addon compilé contre Node refuse de se charger → `electron-rebuild` par
  version majeure d'Electron (actuellement 42.x).
- **N-API atténue l'ABI mais pas le reste** : un addon pur N-API survit aux versions sans
  recompilation, mais il faut toujours un **artefact par OS/arch** et il se charge **dans** l'app.
- **Le FFI (koffi) n'y échappe pas** : koffi est lui-même un addon natif ; on externalise le
  glue C++ mais on embarque un `.node` tiers **plus** la `libparakeet.so` — le chargement reste
  in-process.

**Conséquence** : le natif existe dans les deux chemins (le binaire CLI *est* natif) — seule
change la **frontière** : limites du process (isolation, crash du moteur ≠ crash de l'app,
remplaçable sans toucher l'app, app 100 % JS) ou limites de la mémoire du process Electron
(puissant, mais fragile à maintenir et lié au cycle de vie d'Electron). Pour un projet qui vit
de sa simplicité de build et de ses E2E sur WSLg, le **sous-processus est le pari le moins
risqué**.

## 7. Verdict et questions ouvertes

- **Pour un test rapide** : Chemin A (CLI + segments VAD), sans toucher au zéro-natif — effort
  backend comparable à Murmure, mais insertion structurée à la place de la frappe simulée.
- **Pour le produit** : Chemin B (C-API) si l'on veut le vrai streaming cache-aware ; sinon la
  granularité « énoncé » du Chemin A suffit largement pour la dictée.
- **Le plus gros travail n'est pas le moteur STT, mais l'intégration produit** : insertion
  structurée dans le document, enregistrement audio pour la réécoute, UX de dictée
  (push-to-talk vs VAD).

Questions ouvertes :

1. **Licences des modèles NVIDIA** : `tdt-0.6b-v3` est CC-BY-4.0, mais `nemotron` et
   `realtime_eou` sont marqués « other » sur Hugging Face — à vérifier pour une distribution.
2. **VAD** : RMS maison (comme Murmure) suffit-il, ou faut-il Silero (plus robuste, coût extra) ?
3. **Besoin réel de streaming cache-aware** vs granularité « énoncé par énoncé » (ce qui
   simplifierait tout : pas de bindings natifs).
4. **Taille du modèle vs distribution** : ~1 Go embarqué dans l'installeur, ou téléchargement
   au premier lancement (avec UI de gestion, comme Murmure l'a fait pour l'ONNX) ?
5. **Parallélisme avec la lecture** : dicter (micro) et réécouter l'audio existant
   simultanément ? À valider sur CPU (le 0.6B q8_0 tourne sur CPU moderne, mais pas en overlap
   avec beaucoup d'autres tâches).

---