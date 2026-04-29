// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  timeout: 60000,
  workers: 1, // tests séquentiels (accès GitLab partagé)
  reporter: 'line',
  use: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
  },
});
