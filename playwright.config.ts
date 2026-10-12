import { defineConfig } from '@playwright/test'

// E2E Electron. Pas de webServer : Playwright lance l'app locale via _electron
// et l'argument « . », ou le binaire d'un test d'empaquetage. Le build doit être
// à jour ; le script `test:e2e` le refait avant.
//
// PARALLÈLE : chaque test lance SA propre instance Electron sur un `--user-data-dir`
// isolé (mkdtemp) → aucune ressource partagée, donc parallélisable. `workers` borné
// pour ne pas saturer le GPU/affichage WSLg.
//
// La PILE Nextcloud Docker est, elle, une RESSOURCE PARTAGÉE (verrous exclusifs sur
// le même corpus `MonCorpus`). Ses tests tournent dans un PROJET dédié limité à un
// seul worker : jamais deux scénarios distants en même temps (sinon les verrous
// corpus/entretiens se disputent → « tenu par autrui », PUT 423…). Les tests qui ne
// touchent que le disque local restent pleinement parallèles.
const PILE = [
  'e2e/audio-distant.e2e.ts',
  'e2e/multi-utilisateur.e2e.ts',
  'e2e/correspondances-webdav.e2e.ts',
  'e2e/renommage-webdav.e2e.ts',
  'e2e/dissociation-webdav.e2e.ts',
  'e2e/suppression-webdav.e2e.ts',
  'e2e/variante-webdav.e2e.ts',
]

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  workers: 4,
  // 60s : absorbe le démarrage À FROID d'Electron (premier lancement de la suite
  // sous WSLg) — à chaud un test tourne en ~1-2s.
  timeout: 60_000,
  projects: [
    {
      // Scénarios MultiNextcloud : la pile est partagée → un seul worker, tests
      // séquentiels (les fichiers utilisent déjà `mode: 'serial'` en interne).
      name: 'pile',
      testMatch: PILE,
      workers: 1,
      fullyParallel: false,
    },
    {
      // Tests locaux (disque isolé par `--user-data-dir`) : parallélisables.
      name: 'local',
      testIgnore: PILE,
      fullyParallel: true,
    },
  ],
})
