/**
 * Test E2E — Tentative d'écriture sans verrou
 *
 * Scénario :
 *  1. user1 verrouille entretien1
 *  2. user2 (en lecture seule) tente d'écrire directement via ecrireFichier
 *     → GitLab doit refuser (403 ou autre) et ecrireFichier doit retourner
 *       { success: false }
 *  3. Vérifier que le contenu n'a pas changé (le fichier est intact)
 *  4. user1 écrit normalement (il a le verrou) → succès
 *  5. user1 libère, user2 peut écrire à son tour
 *
 * Ce test valide que la protection LFS côté GitLab est bien active ET que
 * ecrireFichier remonte l'erreur proprement (pas d'exception non gérée).
 *
 * Lancement :
 *   npx playwright test tests/ecriture-sans-verrou.spec.js --reporter=line
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
let contenuOriginal;

test.beforeAll(async () => {
  console.log('\n🔐 Authentification OAuth — user1...');
  const token1 = await obtenirToken(INSTANCE, CLIENT_ID1, CLIENT_SECRET1, USER1, PASS1, TOKEN1);
  console.log('🔐 Authentification OAuth — user2...');
  const token2 = await obtenirToken(INSTANCE, CLIENT_ID2, CLIENT_SECRET2, USER2, PASS2, TOKEN2);

  api1 = new GitLabAPI(INSTANCE, PROJECT, token1, BRANCH);
  api2 = new GitLabAPI(INSTANCE, PROJECT, token2, BRANCH);

  await api1.testerConnexion();
  await api2.testerConnexion();

  // Lire le contenu original avant les tests
  const lecture = await api1.lireFichier(ENTRETIEN1);
  if (!lecture.success) throw new Error(`Impossible de lire ${ENTRETIEN1} : ${lecture.error}`);
  contenuOriginal = lecture.content;
  console.log(`   Contenu original : ${contenuOriginal.length} caractères`);

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

test('1 — user1 verrouille entretien1', async () => {
  const result = await api1.verrouillerFichier(ENTRETIEN1);
  expect(result.success).toBe(true);
  expect(result.readOnly).toBe(false);
  console.log('   user1 a le verrou');
});

test('2 — user2 ne peut pas écrire sans verrou (refus GitLab)', async () => {
  const contenuMalveillant = contenuOriginal + '\n<!-- tentative écriture sans verrou -->';
  const result = await api2.ecrireFichier(ENTRETIEN1, contenuMalveillant);

  console.log('   Réponse ecrireFichier (user2) :', JSON.stringify(result));

  // L'écriture doit échouer
  expect(result.success, 'GitLab doit refuser l\'écriture sans verrou').toBe(false);
  expect(result.error, 'un message d\'erreur doit être présent').toBeTruthy();
  console.log(`   Erreur retournée : ${result.error}`);
});

test('3 — le contenu du fichier est intact après la tentative', async () => {
  const lecture = await api1.lireFichier(ENTRETIEN1);
  expect(lecture.success).toBe(true);
  expect(lecture.content, 'le contenu ne doit pas avoir changé').toBe(contenuOriginal);
  console.log('   ✅ Contenu intact');
});

test('4 — user1 (avec le verrou) peut écrire normalement', async () => {
  // On ajoute un marqueur inoffensif pour vérifier l'écriture réelle
  const contenuModifie = contenuOriginal + '\n<!-- modif user1 avec verrou -->';
  const result = await api1.ecrireFichier(ENTRETIEN1, contenuModifie);

  console.log('   Réponse ecrireFichier (user1) :', JSON.stringify(result));
  expect(result.success, 'user1 avec verrou doit pouvoir écrire').toBe(true);

  // Vérifier que la modification est bien persistée
  const lecture = await api1.lireFichier(ENTRETIEN1);
  expect(lecture.content).toBe(contenuModifie);
  console.log('   ✅ Écriture persistée');

  // Remettre le contenu original
  await api1.ecrireFichier(ENTRETIEN1, contenuOriginal);
});

test('5 — user1 libère, user2 peut écrire à son tour', async () => {
  await api1.deverrouillerFichier(ENTRETIEN1);

  const r = await api2.verrouillerFichier(ENTRETIEN1);
  expect(r.readOnly).toBe(false);

  const contenuUser2 = contenuOriginal + '\n<!-- modif user2 -->';
  const result = await api2.ecrireFichier(ENTRETIEN1, contenuUser2);
  expect(result.success, 'user2 avec verrou doit pouvoir écrire').toBe(true);
  console.log('   user2 a écrit avec succès');

  // Remettre le contenu original
  await api2.ecrireFichier(ENTRETIEN1, contenuOriginal);
  await api2.deverrouillerFichier(ENTRETIEN1);
});
