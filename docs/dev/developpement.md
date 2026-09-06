# Développement

## Démarrer

```bash
npm install
npm run dev          # app en développement (electron-vite)
npm run build        # build main + preload + renderer
npm run start        # prévisualiser le build

npm test                # tests unitaires (vitest, headless)
npm run test:e2e        # e2e Playwright + Electron (build puis lance ; tourne sous WSLg)
npm run diagnostic:e2e  # diagnostics Electron manuels, hors de la suite normale
npm run typecheck       # vue-tsc + tsc
```

**Pile** : Electron + Vue 3 + TipTap/ProseMirror (sans Yjs), electron-vite, vitest, Playwright.

## Stratégie de test

- **`npm test`** (vitest, headless) : teste le **domaine pur** de `src/shared/` et le remap —
  sans DOM, sans Electron. C'est là que vit le test **garde-fou** « discipline d'architecture »
  qui garantit que le domaine ne dépend pas du DOM/ProseMirror.
- **`npm run test:e2e`** (Playwright + Electron) : après un `build`, lance l'app complète et
  couvre les parcours utilisateur (import/export, marquage, anonymisation, patron, navigation,
  persistance…). Tourne sous WSLg.
- **`npm run diagnostic:e2e`** : lance explicitement les diagnostics de connexion et de verrou.
  Ils sont exclus de la suite normale, car ils dépendent de la pile Nextcloud locale et peuvent
  modifier son corpus partagé. Un seul diagnostic peut être ciblé, par exemple avec
  `npm run diagnostic:e2e -- connexion.diagnostic.ts`.
- **`npm run typecheck`** : `vue-tsc` (web) + `tsc` (node).

## Limitation connue en dev : audio figé sous WSLg

Sous WSLg (le WSL2 avec affichage/son intégrés), la lecture audio se fige parfois
après ~13–20 s : le compteur n'avance plus (ou rampe à ~2 % de la vitesse),
l'élément `<audio>` croit toujours jouer (`paused=false`, buffer plein), et ça
ressemble à un « disque rayé ». Le gel est **intermittent** et, une fois installé,
**rien ne le débloque** (pause/play, seek, nudge — testés).

**Cause : le pont audio de WSLg lui-même** (`PulseAudioRDPSink`), pas l'app.
Diagnostic : le même gel se reproduit dans un Electron minimal (aucun code Sonal,
WAV en mémoire via Blob URL — ni protocole `sonal-media`, ni fichier) et dans
SonalPi1 (autre codebase entière). Le protocole custom, la synchro position/
surlignage et le lecteur sont donc sains ; sur un poste avec un vrai backend
audio, la lecture se comporte normalement.

Si le son sous WSL devenait un jour bloquant en dev : workaround connu = installer
un serveur PulseAudio sur Windows et pointer `PULSE_SERVER=tcp:…` depuis WSL
(contourne le pont RDP de WSLg) ; une mise à jour de WSL/Windows peut aussi
régler le problème. À ne pas traiter comme un bug de SonalPi2.
