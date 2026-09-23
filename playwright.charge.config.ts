import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/charge',
  testMatch: 'benchmark.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60 * 60 * 1000,
  expect: { timeout: 120_000 },
  outputDir: 'test-results/charge-playwright',
  reporter: [['list']],
})
