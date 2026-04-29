/**
 * Test E2E — Course au verrou simultanée
 *
 * Scénario :
 *  user1 et user2 tentent de verrouiller entretien1 exactement en même temps.
 *  Un seul doit gagner (readOnly: false), l'autre doit être bloqué proprement
 *  (readOnly: true, success: true, lockedBy renseigné).
 *
 * Ce test vérifie que la gestion du 409 de l'API LFS fonctionne en conditions
 * de concurrence réelle, notamment que lockedBy n'est pas null dans la réponse
 * de conflit.
 *
 * Lancement :
 *   npx playwright test tests/course-verrou.spec.js --reporter=line
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

  // Nettoyage
  await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  console.log('✅ Prêt\n');
});

test.afterAll(async () => {
  if (api1) await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  if (api2) await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test('course au verrou : un seul gagnant, un perdant propre', async () => {
  // Les deux requêtes partent exactement en même temps
  const [r1, r2] = await Promise.all([
    api1.verrouillerFichier(ENTRETIEN1),
    api2.verrouillerFichier(ENTRETIEN1),
  ]);

  console.log('   user1 :', JSON.stringify(r1));
  console.log('   user2 :', JSON.stringify(r2));

  // Les deux réponses doivent être success (pas de crash, pas d'exception)
  expect(r1.success, 'user1 : success doit être true').toBe(true);
  expect(r2.success, 'user2 : success doit être true').toBe(true);

  // Exactement un gagnant et un perdant
  const gagnant = [r1, r2].filter(r => !r.readOnly);
  const perdant  = [r1, r2].filter(r =>  r.readOnly);

  expect(gagnant.length, 'exactement un user doit avoir le verrou').toBe(1);
  expect(perdant.length, 'exactement un user doit être bloqué').toBe(1);

  // Le perdant doit avoir lockedBy renseigné (sinon l'UI ne peut pas afficher qui bloque)
  expect(
    perdant[0].lockedBy,
    'lockedBy doit être renseigné dans la réponse de conflit (sinon bug GitLab LFS 409 sans owner)'
  ).toBeTruthy();

  console.log(`   Gagnant : ${gagnant[0] === r1 ? USER1 : USER2}`);
  console.log(`   Bloqué par : ${perdant[0].lockedBy}`);
});

test('après la course : le vainqueur peut déverrouiller et l\'autre reprendre', async () => {
  // Identifier qui a le verrou
  const verrou = await api1.verifierVerrou(ENTRETIEN1);
  expect(verrou.success).toBe(true);
  expect(verrou.locked).toBe(true);

  const proprietaire = verrou.lockInfo.user;
  console.log(`   Propriétaire du verrou : ${proprietaire}`);

  // Le propriétaire déverrouille
  const apiProprietaire = proprietaire === api1.currentUser?.name || proprietaire === api1.currentUser?.username
    ? api1 : api2;
  const apiAutre = apiProprietaire === api1 ? api2 : api1;

  await apiProprietaire.deverrouillerFichier(ENTRETIEN1);

  // L'autre peut maintenant verrouiller
  const result = await apiAutre.verrouillerFichier(ENTRETIEN1);
  expect(result.success).toBe(true);
  expect(result.readOnly).toBe(false);

  console.log('   ✅ Après déverrouillage, l\'autre user a bien pris le verrou');

  // Nettoyage
  await apiAutre.deverrouillerFichier(ENTRETIEN1);
});
