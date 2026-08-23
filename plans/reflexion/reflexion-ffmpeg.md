# Réflexion — waveform vidéo et extraction ffmpeg

> Question d'origine : comment la waveform est-elle générée pour une vidéo en
> local ? Y a-t-il une extraction de l'audio ?
>
> Réponse courte : **non, il n'y a aucune extraction**. Et c'est un choix qu'on
> assume désormais (v1) ; ce document garde la trace de l'analyse au cas où le
> besoin produit reviendrait.

## Comment ça marche aujourd'hui

`genererEtEcrireWaveform` (`src/renderer/audio/waveform.ts`) fetch les **octets
du fichier entier** via `sonal-media://abs`, puis appelle
`AudioContext.decodeAudioData(octets)` dans le renderer. Il n'y a pas de « piste
audio extraite » quelque part : `decodeAudioData` **démuxe lui-même le
conteneur** (mp4/webm/mov…) et décode sa piste audio — ça fonctionne pour une
vidéo parce que Chromium embarque ce démuxer.

Le coût, en revanche, est réel : le fichier complet transite par la RAM du
renderer même pour n'en lire que l'audio. Une vidéo typique d'entretien filmé
(500 Mo – 4 Go) rend ce chemin irrationnel.

## Décision v1 : pas de waveform sur vidéo

Saut systématique dès que l'extension est dans `EXT_VIDEO` (test AVANT tout
fetch), plus un filet mémoire `TAILLE_MAX_MEDIA` pour un média hors liste :

- le mur d'ondes de l'écran Corpus montre le placeholder existant ;
- le panneau vidéo a déjà son retour visuel : **l'image** ;
- on économise N × fetch complet par corpus (chaque poste régénère).

L'extraction ffmpeg reste l'option documentée ci-dessous, à ne déclencher que
sur besoin utilisateur exprimé (« je veux voir la forme d'onde de mes entretiens
filmés »), jamais par anticipation.

## Option ffmpeg-static, le jour où le besoin est réel

Candidat : [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static) —
binaires pré-compilés macOS / Windows / Linux, pas de bundling manuel de ffmpeg.

### Le design gagnant : tout en flux

Ce n'est PAS « extraire un WAV puis le décoder », mais calculer l'enveloppe
pendant l'extraction :

```text
spawn(ffmpegPath, [
  '-i', fichierMedia,
  '-vn',                     // ignore la vidéo — c'est TOUT l'intérêt
  '-map', 'a:0?',
  '-ac', '1', '-ar', '8000', // mono, 8 kHz : largement assez pour du min/max
  '-f', 's16le', 'pipe:1',
])
→ chunks Int16 lus sur stdout → enveloppe min/max incrémentale
   (`enveloppe.ts` est pure, réutilisable côté main)
→ le renderer ne reçoit que deux Float32Array (~800 pts) à dessiner en PNG
```

Mémoire bornée quelle que soit la taille du média. Bonus : fiabiliserait aussi
le décodage des audios exotiques que `decodeAudioData` peine parfois à ouvrir
(flac, opus selon contexte).

### Les conséquences à assumer (critères d'acceptation)

1. **Téléchargement au postinstall** depuis GitHub (~77 Mo par plateforme) :
   dépendance réseau à l'installation (CI offline, proxies d'entreprise) et
   point supply-chain → version épinglée exacte + vérification de checksum du
   binaire.
2. **Packaging Electron** : binaire HORS asar (`asarUnpack` ou copie
   `extraResources`) + résolution de chemin
   `app.isPackaged ? resourcesPath : node_modules` — même discipline que
   `CorpusTest`.
3. **Licence** : les builds fournis sont des builds **GPL** (libx264 inclus).
   Non-bloquant en usage interne ; contraignant si l'app est distribuée un jour
   (ffmpeg existe en LGPL mais pas via ces builds).
4. **Dégradation gracieuse obligatoire** : binaire absent ou téléchargement raté
   → fallback « pas de waveform » (comportement v1), JAMAIS d'échec
   d'assignation ni de tirage — la waveform reste un dérivé optionnel.

### Alternative écartée

WebCodecs / démuxage maison en JS : complexe (moov en queue de mp4…), pas
rentable face aux options ci-dessus.
