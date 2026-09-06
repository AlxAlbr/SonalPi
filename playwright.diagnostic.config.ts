import { defineConfig } from '@playwright/test'

/**
 *  Diagnostics Electron lancés uniquement sur demande. Ils ne font pas partie
 *  de la configuration Playwright utilisée par `npm run test:e2e`.
 */
export default defineConfig({
  testDir: './e2e/diagnostics',
  testMatch: '**/*.diagnostic.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
})
