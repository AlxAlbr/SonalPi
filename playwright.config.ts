import { defineConfig } from '@playwright/test'

// E2E Electron. Pas de webServer : Playwright lance l'app Electron elle-même via
// _electron (args ['.'] → ./out/main/index.js). Le build doit être à jour ; le
// script `test:e2e` le (re)fait avant.
//
// PARALLÈLE : chaque test lance SA propre instance Electron sur un `--user-data-dir`
// isolé (mkdtemp) → aucune ressource partagée, donc parallélisable (l'ancien
// « app mono-instance » était une méprise : Electron accepte N instances sur des
// profils distincts). `workers` borné pour ne pas saturer le GPU/affichage WSLg.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  workers: 4,
  // 60s : absorbe le démarrage À FROID d'Electron (premier lancement de la suite
  // sous WSLg) — à chaud un test tourne en ~1-2s.
  timeout: 60_000,
})
