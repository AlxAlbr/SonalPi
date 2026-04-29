/**
 * Test E2E — Scénario de crash / coupure de session
 *
 * Scénario :
 *  1. user1 ouvre entretien1 → acquiert le verrou
 *  2. user1 "crashe" (batterie coupée) → fermeture sans deverrouillerFichier
 *  3. Vérifier que le verrou est toujours là (user2 est bloqué)
 *  4. user1 revient et retente d'ouvrir entretien1
 *     → GitLab reconnaît que le verrou lui appartient déjà (wasLocked: true)
 *     → user1 peut reprendre l'édition sans erreur
 *  5. user1 ferme proprement → verrou libéré → user2 peut éditer
 *
 * Lancement :
 *   npx playwright test tests/crash.spec.js --reporter=line
 */

require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { obtenirToken } = require('./helpers/oauth');
const GitLabAPI = require('../modules/gitlab_api');

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

for (const [nom, val] of Object.entries({ INSTANCE, PROJECT, USER1, USER2, ENTRETIEN1 })) {
  if (!val) throw new Error(`Variable d'environnement manquante : GITLAB_${nom}`);
}

let api1, api2;

test.beforeAll(async () => {
  console.log('\n🔐 Authentification OAuth — user1...');
  const token1 = await obtenirToken(INSTANCE, CLIENT_ID1, CLIENT_SECRET1, USER1, PASS1, TOKEN1);
  console.log('🔐 Authentification OAuth — user2...');
  const token2 = await obtenirToken(INSTANCE, CLIENT_ID2, CLIENT_SECRET2, USER2, PASS2, TOKEN2);

  api1 = new GitLabAPI(INSTANCE, PROJECT, token1, BRANCH);
  api2 = new GitLabAPI(INSTANCE, PROJECT, token2, BRANCH);

  await api1.testerConnexion();
  await api2.testerConnexion();

  // Nettoyage : libérer tout verrou résiduel d'un test précédent
  await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  console.log('✅ Prêt\n');
});

// Garantir la libération même si un test échoue à mi-chemin
test.afterAll(async () => {
  if (api1) await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  if (api2) await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
});

// ── Tests ────────────────────────────────────────────────────────────────────

test('1 — user1 ouvre entretien1 et acquiert le verrou', async () => {
  const result = await api1.verrouillerFichier(ENTRETIEN1);

  expect(result.success).toBe(true);
  expect(result.readOnly).toBe(false);
  console.log('   user1 a le verrou');

  // ⚡ CRASH SIMULÉ : on ne déverrouille PAS — la session s'arrête brutalement
  // Dans la réalité : processus tué, batterie coupée, connexion réseau perdue
  console.log('   ⚡ Crash simulé — le verrou reste sur GitLab');
});

test('2 — le verrou persiste après le crash (user2 est bloqué)', async () => {
  const verrou = await api2.verifierVerrou(ENTRETIEN1);

  expect(verrou.success).toBe(true);
  expect(verrou.locked, 'le verrou doit toujours être là après le crash').toBe(true);
  expect(verrou.lockInfo?.user).toBeTruthy();
  console.log(`   verrou toujours actif, détenu par : ${verrou.lockInfo.user}`);
});

test('3 — user2 ne peut pas éditer pendant que user1 est "crashé"', async () => {
  const result = await api2.verrouillerFichier(ENTRETIEN1);

  expect(result.success).toBe(true);
  expect(result.readOnly, 'user2 doit être bloqué en lecture seule').toBe(true);
  console.log(`   user2 bloqué — verrou détenu par : ${result.lockedBy}`);
});

test('4 — user1 revient et récupère son propre verrou (wasLocked: true)', async () => {
  const result = await api1.verrouillerFichier(ENTRETIEN1);

  // GitLab retourne 409 car le verrou existe déjà,
  // mais verrouillerFichier détecte que c'est le même user → réouverture autorisée
  expect(result.success).toBe(true);
  expect(result.readOnly, 'user1 ne doit pas être bloqué sur son propre verrou').toBe(false);
  expect(result.wasLocked, 'wasLocked doit indiquer que le verrou préexistait').toBe(true);
  console.log('   user1 a récupéré sa session — wasLocked:', result.wasLocked);
});

test('5 — user1 ferme proprement, user2 peut ensuite éditer', async () => {
  // user1 ferme correctement cette fois
  const unlock = await api1.deverrouillerFichier(ENTRETIEN1);
  expect(unlock.success).toBe(true);
  console.log('   user1 a fermé proprement');

  // user2 peut maintenant prendre le verrou
  const result = await api2.verrouillerFichier(ENTRETIEN1);
  expect(result.success).toBe(true);
  expect(result.readOnly, 'user2 doit pouvoir éditer après libération').toBe(false);
  console.log('   user2 a acquis le verrou');

  // Nettoyage final
  await api2.deverrouillerFichier(ENTRETIEN1);
});
