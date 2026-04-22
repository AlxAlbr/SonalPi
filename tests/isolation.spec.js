/**
 * Test E2E — Isolation des verrous entre entretiens
 *
 * Scénario :
 *  1. user1 verrouille entretien1
 *  2. user2 verrouille entretien2
 *  3. Vérifier que chaque user peut éditer son propre entretien
 *  4. Vérifier l'isolation : user1 est bloqué sur entretien2, user2 sur entretien1
 *  5. user1 libère entretien1 → user2 peut le prendre sans perdre entretien2
 *  6. user2 libère entretien2 → user1 peut le prendre sans perdre entretien1
 *
 * Lancement :
 *   npx playwright test tests/isolation.spec.js --reporter=line
 */

require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { obtenirTokenOAuth } = require('./helpers/oauth');
const GitLabAPI = require('../modules/gitlab_api');

const {
  GITLAB_INSTANCE: INSTANCE,
  GITLAB_CLIENT_ID: CLIENT_ID,
  GITLAB_CLIENT_SECRET: CLIENT_SECRET = '',
  GITLAB_PROJECT: PROJECT,
  GITLAB_BRANCH: BRANCH = 'main',
  GITLAB_USERNAME_USER1: USER1,
  GITLAB_PASSWORD_USER1: PASS1,
  GITLAB_USERNAME_USER2: USER2,
  GITLAB_PASSWORD_USER2: PASS2,
  GITLAB_ENTRETIEN1: ENTRETIEN1,
  GITLAB_ENTRETIEN2: ENTRETIEN2,
} = process.env;

for (const [nom, val] of Object.entries({ INSTANCE, CLIENT_ID, PROJECT, USER1, PASS1, USER2, PASS2, ENTRETIEN1, ENTRETIEN2 })) {
  if (!val) throw new Error(`Variable d'environnement manquante : GITLAB_${nom}`);
}

let api1, api2;

test.beforeAll(async () => {
  console.log('\n🔐 Authentification OAuth — user1...');
  const token1 = await obtenirTokenOAuth(INSTANCE, CLIENT_ID, CLIENT_SECRET, USER1, PASS1);
  console.log('🔐 Authentification OAuth — user2...');
  const token2 = await obtenirTokenOAuth(INSTANCE, CLIENT_ID, CLIENT_SECRET, USER2, PASS2);

  api1 = new GitLabAPI(INSTANCE, PROJECT, token1, BRANCH);
  api2 = new GitLabAPI(INSTANCE, PROJECT, token2, BRANCH);

  await api1.testerConnexion();
  await api2.testerConnexion();

  // Nettoyage : libérer tout verrou résiduel
  await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api1.deverrouillerFichier(ENTRETIEN2).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN2).catch(() => {});
  console.log('✅ Prêt\n');
});

test.afterAll(async () => {
  if (api1) {
    await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
    await api1.deverrouillerFichier(ENTRETIEN2).catch(() => {});
  }
  if (api2) {
    await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
    await api2.deverrouillerFichier(ENTRETIEN2).catch(() => {});
  }
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('1 — user1 verrouille entretien1, user2 verrouille entretien2', async () => {
  const r1 = await api1.verrouillerFichier(ENTRETIEN1);
  const r2 = await api2.verrouillerFichier(ENTRETIEN2);

  expect(r1.success).toBe(true);
  expect(r1.readOnly).toBe(false);
  expect(r2.success).toBe(true);
  expect(r2.readOnly).toBe(false);

  console.log('   user1 a entretien1, user2 a entretien2');
});

test('2 — user1 est bloqué sur entretien2 (appartient à user2)', async () => {
  const result = await api1.verrouillerFichier(ENTRETIEN2);

  expect(result.success).toBe(true);
  expect(result.readOnly, 'user1 doit être bloqué sur entretien2').toBe(true);
  expect(result.lockedBy).toBeTruthy();
  console.log(`   user1 bloqué sur entretien2 — verrou de : ${result.lockedBy}`);
});

test('3 — user2 est bloqué sur entretien1 (appartient à user1)', async () => {
  const result = await api2.verrouillerFichier(ENTRETIEN1);

  expect(result.success).toBe(true);
  expect(result.readOnly, 'user2 doit être bloqué sur entretien1').toBe(true);
  expect(result.lockedBy).toBeTruthy();
  console.log(`   user2 bloqué sur entretien1 — verrou de : ${result.lockedBy}`);
});

test('4 — chaque user peut toujours récupérer son propre verrou (wasLocked)', async () => {
  const r1 = await api1.verrouillerFichier(ENTRETIEN1);
  const r2 = await api2.verrouillerFichier(ENTRETIEN2);

  expect(r1.readOnly).toBe(false);
  expect(r1.wasLocked).toBe(true);
  expect(r2.readOnly).toBe(false);
  expect(r2.wasLocked).toBe(true);

  console.log('   user1 a retrouvé entretien1, user2 a retrouvé entretien2');
});

test('5 — user1 libère entretien1, user2 peut le prendre sans perdre entretien2', async () => {
  await api1.deverrouillerFichier(ENTRETIEN1);

  // user2 prend entretien1 en plus d'entretien2 (deux verrous simultanés)
  const r = await api2.verrouillerFichier(ENTRETIEN1);
  expect(r.success).toBe(true);
  expect(r.readOnly, 'user2 doit pouvoir prendre entretien1').toBe(false);

  // entretien2 toujours verrouillé par user2
  const verrou2 = await api2.verifierVerrou(ENTRETIEN2);
  expect(verrou2.locked, 'entretien2 doit toujours être verrouillé').toBe(true);

  console.log('   user2 détient maintenant entretien1 ET entretien2');
});

test('6 — user2 libère tout, user1 peut prendre les deux entretiens', async () => {
  await api2.deverrouillerFichier(ENTRETIEN1);
  await api2.deverrouillerFichier(ENTRETIEN2);

  const r1 = await api1.verrouillerFichier(ENTRETIEN1);
  const r2 = await api1.verrouillerFichier(ENTRETIEN2);

  expect(r1.readOnly).toBe(false);
  expect(r2.readOnly).toBe(false);

  console.log('   user1 détient maintenant entretien1 ET entretien2');

  // Nettoyage
  await api1.deverrouillerFichier(ENTRETIEN1);
  await api1.deverrouillerFichier(ENTRETIEN2);
});
