/**
 * Test E2E — Scénario de verrouillage GitLab
 *
 * Scénario :
 *  1. user1 ouvre entretien1  → acquiert le verrou
 *  2. user2 tente d'ouvrir entretien1 → bloqué (lecture seule)
 *  3. user2 vérifie le statut → fichier signalé verrouillé par user1
 *  4. user1 ferme entretien1  → libère le verrou
 *  5. user2 ouvre entretien1  → acquiert le verrou (succès)
 *
 * Prérequis :
 *  - Fichier .env renseigné (voir .env à la racine)
 *  - Application OAuth GitLab créée avec redirect_uri http://127.0.0.1:7474/callback
 *  - LFS activé sur le projet GitLab (Settings > General > LFS)
 *  - Le fichier GITLAB_ENTRETIEN1 doit exister dans le dépôt
 *
 * Lancement :
 *   npx playwright test tests/verrouillage.spec.js --reporter=line
 */

require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { obtenirToken } = require('./helpers/oauth');
const GitLabAPI = require('../modules/gitlab_api');

// ── Config depuis .env ───────────────────────────────────────────────────────
const {
  GITLAB_INSTANCE: INSTANCE,
  GITLAB_CLIENT_ID_USER1: CLIENT_ID1 = '',
  GITLAB_CLIENT_SECRET_USER1: CLIENT_SECRET1 = '',
  GITLAB_CLIENT_ID_USER2: CLIENT_ID2 = '',
  GITLAB_CLIENT_SECRET_USER2: CLIENT_SECRET2 = '',
  GITLAB_PROJECT: PROJECT,
  GITLAB_BRANCH: BRANCH = 'main',
  GITLAB_USERNAME_USER1: USER1,
  GITLAB_PASSWORD_USER1: PASS1 = '',
  GITLAB_TOKEN_USER1: TOKEN1 = '',
  GITLAB_USERNAME_USER2: USER2,
  GITLAB_PASSWORD_USER2: PASS2 = '',
  GITLAB_TOKEN_USER2: TOKEN2 = '',
  GITLAB_ENTRETIEN1: ENTRETIEN1,
} = process.env;

// Vérification que les variables requises sont présentes
for (const [nom, val] of Object.entries({ INSTANCE, PROJECT, USER1, USER2, ENTRETIEN1 })) {
  if (!val) throw new Error(`Variable d'environnement manquante : GITLAB_${nom}`);
}

// ── État partagé entre les tests (tokens et APIs) ────────────────────────────
let api1, api2;

// ── Authentification : exécutée une seule fois avant tous les tests ──────────
test.beforeAll(async () => {
  console.log(`\n🔐 Authentification OAuth — user1 (${USER1})...`);
  const token1 = await obtenirToken(INSTANCE, CLIENT_ID1, CLIENT_SECRET1, USER1, PASS1, TOKEN1);
  console.log('✅ user1 authentifié');

  console.log(`🔐 Authentification OAuth — user2 (${USER2})...`);
  const token2 = await obtenirToken(INSTANCE, CLIENT_ID2, CLIENT_SECRET2, USER2, PASS2, TOKEN2);
  console.log('✅ user2 authentifié\n');

  api1 = new GitLabAPI(INSTANCE, PROJECT, token1, BRANCH);
  api2 = new GitLabAPI(INSTANCE, PROJECT, token2, BRANCH);

  // Initialise currentUser (nécessaire pour identifier le propriétaire du verrou)
  await api1.testerConnexion();
  await api2.testerConnexion();

  // Nettoyer tout verrou résiduel d'un test précédent
  await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
});

// Nettoyage final : libérer le verrou même si un test échoue
test.afterAll(async () => {
  if (api1) await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  if (api2) await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('1 — user1 ouvre entretien1 et acquiert le verrou', async () => {
  const result = await api1.verrouillerFichier(ENTRETIEN1);

  expect(result.success, 'verrouillerFichier doit retourner success').toBe(true);
  expect(result.readOnly, 'user1 ne doit pas être en lecture seule').toBe(false);
  console.log('   user1 a le verrou (wasLocked:', result.wasLocked, ')');
});

test('2 — user2 ne peut pas modifier entretien1 (lecture seule)', async () => {
  const result = await api2.verrouillerFichier(ENTRETIEN1);

  expect(result.success, 'la réponse doit être success (conflit géré proprement)').toBe(true);
  expect(result.readOnly, 'user2 doit être en lecture seule').toBe(true);
  expect(result.lockedBy, 'lockedBy doit être renseigné').toBeTruthy();
  console.log(`   user2 bloqué — verrou détenu par : ${result.lockedBy}`);
});

test('3 — verifierVerrou confirme que le fichier est verrouillé par user1', async () => {
  const result = await api2.verifierVerrou(ENTRETIEN1);

  expect(result.success).toBe(true);
  expect(result.locked, 'le fichier doit être signalé comme verrouillé').toBe(true);
  expect(result.lockInfo).toBeTruthy();
  console.log(`   verrou confirmé — détenu par : ${result.lockInfo.user}`);
});

test('4 — user1 ferme entretien1 et libère le verrou', async () => {
  const result = await api1.deverrouillerFichier(ENTRETIEN1);

  expect(result.success, 'le déverrouillage doit réussir').toBe(true);
  console.log('   verrou libéré par user1');
});

test('5 — user2 peut maintenant ouvrir et modifier entretien1', async () => {
  const result = await api2.verrouillerFichier(ENTRETIEN1);

  expect(result.success, 'user2 doit pouvoir verrouiller').toBe(true);
  expect(result.readOnly, 'user2 ne doit plus être en lecture seule').toBe(false);
  console.log('   user2 a bien acquis le verrou');

  // Libérer pour ne pas laisser de verrou résiduel
  await api2.deverrouillerFichier(ENTRETIEN1);
});
