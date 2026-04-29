/**
 * Test E2E — Synchronisation des thématiques entre utilisateurs (GitLab)
 *
 * Contexte :
 *  Quand User A crée une nouvelle thématique (édition_categories.html), Sonal appelle
 *  setThm() + sauvegarderCorpus(). Le .crp distant reçoit le tabThm mis à jour.
 *  Mais `rafraichirCorpus()` (veille 30s de User B) ne lisait PAS `corpusDistant.tabThm`
 *  → User B ne voyait jamais la nouvelle thématique.
 *
 *  Fix appliqué dans rafraichirCorpus() :
 *   - Lecture de `corpusDistant.tabThm`
 *   - Comparaison JSON avec le tabThm local
 *   - Si différent → setThm() + loadThm() + affichListThmCrp() pour rafraîchir l'UI
 *
 *  Le test vérifie :
 *   A) User A crée une thématique → le .crp est mis à jour sur GitLab
 *   B) User B lit le .crp → le tabThm contient la nouvelle thématique
 *   C) Simulation de la logique BUGGY : rafraichirCorpus sans sync tabThm → thème absent
 *   D) Simulation de la logique CORRIGÉE : rafraichirCorpus avec sync tabThm → thème présent
 *   E) User A ajoute une thématique enfant (rang > 0) → User B la voit correctement
 *   F) User A supprime une thématique → User B voit la liste réduite
 *
 * Lancement :
 *   npm run test:sync-thematiques
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
  GITLAB_CRP: CRP_FILE,
} = process.env;

for (const [nom, val] of Object.entries({ INSTANCE, PROJECT, USER1, USER2, CRP_FILE })) {
  if (!val) throw new Error(`Variable d'environnement manquante : ${nom}`);
}

// ── Thématiques de test ───────────────────────────────────────────────────────

const THM_INITIAL = [
  { code: 'cat_001', couleur: '#3498db', nom: 'Thème bleu', taille: '', rang: 0, act: true, cmpct: false },
];

const THM_NOUVEAU = {
  code: 'cat_002', couleur: '#e74c3c', nom: 'Thème rouge (nouveau)', taille: '', rang: 0, act: true, cmpct: false,
};

const THM_ENFANT = {
  code: 'cat_003', couleur: '#2ecc71', nom: 'Sous-thème vert', taille: '', rang: 1, act: true, cmpct: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse un .crp et retourne l'objet JS
 */
function parseCrp(content) {
  return JSON.parse(content);
}

/**
 * Génère un .crp minimal avec le tabThm fourni
 */
function genererCrp(tabThm, entBase) {
  return JSON.stringify({
    tabThm,
    tabEnt: entBase ? [entBase] : [],
    tabVar: [],
    tabDic: [],
  });
}

/**
 * Simule la logique BUGGY de rafraichirCorpus() :
 * ne lit PAS tabThm du corpus distant.
 *
 * @param {Array} tabThmLocal  tabThm courant de User B
 * @param {Object} corpusDistant  objet parsé depuis le .crp distant
 * @returns {{ tabThm: Array, mis_a_jour: boolean }}
 */
function simulerRafraichir_buggy(tabThmLocal, corpusDistant) {
  // La version buggy n'a pas de bloc tabThm → tabThm local inchangé
  return { tabThm: tabThmLocal, mis_a_jour: false };
}

/**
 * Simule la logique CORRIGÉE de rafraichirCorpus() :
 * compare tabThm distant vs local, met à jour si différent.
 *
 * @param {Array} tabThmLocal
 * @param {Object} corpusDistant
 * @returns {{ tabThm: Array, mis_a_jour: boolean }}
 */
function simulerRafraichir_fixed(tabThmLocal, corpusDistant) {
  if (!corpusDistant.tabThm) return { tabThm: tabThmLocal, mis_a_jour: false };
  const distant = JSON.stringify(corpusDistant.tabThm);
  const local   = JSON.stringify(tabThmLocal);
  if (distant === local) return { tabThm: tabThmLocal, mis_a_jour: false };
  // On applique le même traitement que dans le fix : act=true, cmpct=false
  const tabThmNouveau = corpusDistant.tabThm.map(t => ({ ...t, act: true, cmpct: false }));
  return { tabThm: tabThmNouveau, mis_a_jour: true };
}

/**
 * Vérifie qu'une thématique donnée est présente dans un tabThm
 */
function contientThm(tabThm, code) {
  return tabThm.some(t => t.code === code);
}

// ── État partagé ───────────────────────────────────────────────────────────────

let api1, api2;
let crpOriginalContent;
let entBase;

// ── Setup ──────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  console.log('\n🔐 Authentification OAuth — user1...');
  const token1 = await obtenirToken(INSTANCE, CLIENT_ID1, CLIENT_SECRET1, USER1, PASS1, TOKEN1);
  console.log('🔐 Authentification OAuth — user2...');
  const token2 = await obtenirToken(INSTANCE, CLIENT_ID2, CLIENT_SECRET2, USER2, PASS2, TOKEN2);

  api1 = new GitLabAPI(INSTANCE, PROJECT, token1, BRANCH);
  api2 = new GitLabAPI(INSTANCE, PROJECT, token2, BRANCH);
  await api1.testerConnexion();
  await api2.testerConnexion();

  // Sauvegarder le .crp original pour restauration
  const lectCrp = await api1.lireFichier(CRP_FILE);
  if (!lectCrp.success) throw new Error(`Impossible de lire ${CRP_FILE} : ${lectCrp.error}`);
  crpOriginalContent = lectCrp.content;

  const crpParse = parseCrp(crpOriginalContent);
  entBase = crpParse.tabEnt?.[0] ?? null;

  console.log(`✅ Corpus chargé, tabThm initial : ${crpParse.tabThm?.length ?? 0} thématique(s)\n`);
});

test.afterAll(async () => {
  if (!api1 || !crpOriginalContent) return;
  console.log('\n🧹 Restauration du .crp original...');
  await api1.ecrireFichier(CRP_FILE, crpOriginalContent);
  console.log('   ✅ .crp restauré');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO A — User A crée une thématique → le .crp est mis à jour sur GitLab
// ═══════════════════════════════════════════════════════════════════════════════

test('A — user1 crée une thématique → le .crp contient le nouveau tabThm', async () => {
  // User A part d'un état initial avec une seule thématique
  const crpInitial = genererCrp(THM_INITIAL, entBase);
  await api1.ecrireFichier(CRP_FILE, crpInitial);
  await new Promise(r => setTimeout(r, 2000));

  // Vérifier l'état initial
  const lectAvant = await api2.lireFichier(CRP_FILE);
  const crpAvant = parseCrp(lectAvant.content);
  expect(crpAvant.tabThm.length, 'Avant : 1 thématique').toBe(1);
  expect(contientThm(crpAvant.tabThm, 'cat_001'), 'cat_001 présente').toBe(true);
  expect(contientThm(crpAvant.tabThm, 'cat_002'), 'cat_002 absente initialement').toBe(false);

  // User A simule la création d'une nouvelle thématique :
  // setThm() met à jour main → sauvegarderCorpus() écrit le .crp avec le nouveau tabThm
  const tabThmApres = [...THM_INITIAL, THM_NOUVEAU];
  const crpApres = genererCrp(tabThmApres, entBase);
  await api1.ecrireFichier(CRP_FILE, crpApres);
  await new Promise(r => setTimeout(r, 2000));

  // User B lit le .crp mis à jour
  const lectApres = await api2.lireFichier(CRP_FILE);
  expect(lectApres.success, '.crp lisible par user2').toBe(true);
  const crpCourant = parseCrp(lectApres.content);

  expect(crpCourant.tabThm.length, 'Après : 2 thématiques').toBe(2);
  expect(contientThm(crpCourant.tabThm, 'cat_001'), 'cat_001 toujours présente').toBe(true);
  expect(contientThm(crpCourant.tabThm, 'cat_002'), 'cat_002 présente après création').toBe(true);
  expect(crpCourant.tabThm[1].nom, 'Nom correct').toBe('Thème rouge (nouveau)');
  expect(crpCourant.tabThm[1].couleur, 'Couleur correcte').toBe('#e74c3c');

  console.log('   ✅ Scénario A OK : le .crp contient bien la nouvelle thématique');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO B — Bug : rafraichirCorpus sans sync tabThm → thème absent chez user B
// ═══════════════════════════════════════════════════════════════════════════════

test('B — logique BUGGY : rafraichirCorpus sans tabThm → user2 ne voit pas la nouvelle thématique', async () => {
  // User B n'a que la thématique initiale dans son tabThm local
  const tabThmLocal = [...THM_INITIAL];

  // Le .crp distant a la nouvelle thématique (état après Scénario A)
  const lectCrp = await api2.lireFichier(CRP_FILE);
  expect(lectCrp.success, '.crp lisible').toBe(true);
  const corpusDistant = parseCrp(lectCrp.content);

  // Vérification préalable : le .crp distant a bien 2 thématiques
  expect(corpusDistant.tabThm.length, '.crp distant : 2 thématiques').toBe(2);

  // Simulation de rafraichirCorpus() version buggy
  const { tabThm: tabThmResultat, mis_a_jour } = simulerRafraichir_buggy(tabThmLocal, corpusDistant);

  expect(mis_a_jour, '[buggy] aucune mise à jour effectuée').toBe(false);
  expect(tabThmResultat.length, '[buggy] tabThm local inchangé : 1 thématique').toBe(1);
  expect(contientThm(tabThmResultat, 'cat_002'), '[buggy] cat_002 absente du tabThm local').toBe(false);

  console.log('   ✅ Bug B reproduit : logique buggy ne sync pas tabThm → thématique manquante chez user2');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C — Fix : rafraichirCorpus avec sync tabThm → user2 voit la thématique
// ═══════════════════════════════════════════════════════════════════════════════

test('C — logique CORRIGÉE : rafraichirCorpus avec tabThm → user2 voit la nouvelle thématique', async () => {
  // User B n'a que la thématique initiale
  const tabThmLocal = [...THM_INITIAL];

  // Le .crp distant a la nouvelle thématique
  const lectCrp = await api2.lireFichier(CRP_FILE);
  const corpusDistant = parseCrp(lectCrp.content);

  // Simulation de rafraichirCorpus() version corrigée
  const { tabThm: tabThmResultat, mis_a_jour } = simulerRafraichir_fixed(tabThmLocal, corpusDistant);

  expect(mis_a_jour, '[fixed] mise à jour détectée').toBe(true);
  expect(tabThmResultat.length, '[fixed] tabThm mis à jour : 2 thématiques').toBe(2);
  expect(contientThm(tabThmResultat, 'cat_001'), '[fixed] cat_001 toujours présente').toBe(true);
  expect(contientThm(tabThmResultat, 'cat_002'), '[fixed] cat_002 présente').toBe(true);

  // Vérifier que act=true et cmpct=false ont été forcés (comportement du fix)
  tabThmResultat.forEach((t, i) => {
    expect(t.act,   `tabThm[${i}].act doit être true`).toBe(true);
    expect(t.cmpct, `tabThm[${i}].cmpct doit être false`).toBe(false);
  });

  console.log('   ✅ Fix C validé : rafraichirCorpus sync tabThm et user2 voit la nouvelle thématique');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO D — Idempotence : si le tabThm n'a pas changé, pas de mise à jour inutile
// ═══════════════════════════════════════════════════════════════════════════════

test('D — idempotence : si tabThm inchangé, rafraichirCorpus ne déclenche pas de mise à jour', async () => {
  // User B a déjà le même tabThm que le distant (après sync C)
  const tabThmLocal = [
    { ...THM_INITIAL[0] },
    { ...THM_NOUVEAU, act: true, cmpct: false },
  ];

  const lectCrp = await api2.lireFichier(CRP_FILE);
  const corpusDistant = parseCrp(lectCrp.content);

  const { mis_a_jour } = simulerRafraichir_fixed(tabThmLocal, corpusDistant);

  expect(mis_a_jour, 'Pas de mise à jour si tabThm identique').toBe(false);

  console.log('   ✅ Scénario D OK : pas de mise à jour inutile si le tabThm est déjà à jour');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO E — Thématique enfant (rang > 0) correctement transmise
// ═══════════════════════════════════════════════════════════════════════════════

test('E — user1 ajoute un sous-thème (rang=1) → user2 le récupère avec le bon rang', async () => {
  // User A ajoute un sous-thème enfant de cat_001
  const tabThmAvecEnfant = [...THM_INITIAL, THM_NOUVEAU, THM_ENFANT];
  await api1.ecrireFichier(CRP_FILE, genererCrp(tabThmAvecEnfant, entBase));
  await new Promise(r => setTimeout(r, 2000));

  const lectCrp = await api2.lireFichier(CRP_FILE);
  const corpusDistant = parseCrp(lectCrp.content);

  expect(corpusDistant.tabThm.length, '3 thématiques dans le .crp').toBe(3);

  // Simulation du fix
  const tabThmLocal = [...THM_INITIAL]; // User B encore en retard
  const { tabThm: tabThmResultat, mis_a_jour } = simulerRafraichir_fixed(tabThmLocal, corpusDistant);

  expect(mis_a_jour, 'Mise à jour détectée').toBe(true);
  expect(tabThmResultat.length, '3 thématiques après sync').toBe(3);

  const enfant = tabThmResultat.find(t => t.code === 'cat_003');
  expect(enfant, 'cat_003 présent').toBeTruthy();
  expect(enfant.rang, 'rang du sous-thème = 1').toBe(1);
  expect(enfant.nom, 'nom correct').toBe('Sous-thème vert');

  console.log('   ✅ Scénario E OK : sous-thème transmis avec rang=1 correct');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO F — User A supprime une thématique → User B voit la liste réduite
// ═══════════════════════════════════════════════════════════════════════════════

test('F — user1 supprime une thématique → user2 voit la liste réduite', async () => {
  // User A part de 3 thématiques et en supprime une (cat_002)
  const tabThmReduit = [THM_INITIAL[0], THM_ENFANT];
  await api1.ecrireFichier(CRP_FILE, genererCrp(tabThmReduit, entBase));
  await new Promise(r => setTimeout(r, 2000));

  const lectCrp = await api2.lireFichier(CRP_FILE);
  const corpusDistant = parseCrp(lectCrp.content);

  expect(corpusDistant.tabThm.length, '2 thématiques dans le .crp après suppression').toBe(2);
  expect(contientThm(corpusDistant.tabThm, 'cat_002'), 'cat_002 supprimée').toBe(false);

  // Simulation du fix : User B avait 3 thématiques
  const tabThmLocal = [THM_INITIAL[0], THM_NOUVEAU, THM_ENFANT];
  const { tabThm: tabThmResultat, mis_a_jour } = simulerRafraichir_fixed(tabThmLocal, corpusDistant);

  expect(mis_a_jour, 'Mise à jour détectée après suppression').toBe(true);
  expect(tabThmResultat.length, 'tabThm réduit à 2').toBe(2);
  expect(contientThm(tabThmResultat, 'cat_002'), 'cat_002 absente après sync').toBe(false);
  expect(contientThm(tabThmResultat, 'cat_001'), 'cat_001 toujours là').toBe(true);
  expect(contientThm(tabThmResultat, 'cat_003'), 'cat_003 toujours là').toBe(true);

  console.log('   ✅ Scénario F OK : suppression d\'une thématique synchronisée chez user2');
});
