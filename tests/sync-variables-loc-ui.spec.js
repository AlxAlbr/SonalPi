/**
 * Test UI — Synchronisation d'une variable locuteur entre utilisateurs (GitLab)
 *
 * Vérifie avec de vraies instances Electron + screenshots :
 *  1. User1 ouvre le corpus GitLab (les entretiens ont deux locuteurs : "Enquêteur" et "Enquêté")
 *  2. User1 ouvre "Base de données" et ajoute une variable "Statut" (champ = locuteur)
 *  3. User1 saisit "Interviewer" pour le locuteur 1 (Enquêteur) de l'entretien 1 → screenshot
 *  4. User1 saisit "Enquêté" pour le locuteur 2 (Enquêté) de l'entretien 1 → screenshot
 *  5. Vérification que le .crp contient les deux valeurs dans tabDat
 *  6. User2 ouvre le même corpus → screenshot → voit la colonne "Statut"
 *  7. User2 voit les deux valeurs sur les lignes locuteurs de l'entretien 1 → screenshot
 *
 * Lancement :
 *   npm run test:sync-variables-loc-ui
 */

require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { obtenirToken } = require('./helpers/oauth');
const GitLabAPI = require('../modules/gitlab_api');

// ── Variables d'environnement ─────────────────────────────────────────────────
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
  GITLAB_ENTRETIEN1: ENT1_FILE,
} = process.env;

for (const [nom, val] of Object.entries({ INSTANCE, PROJECT, USER1, USER2, CRP_FILE, ENT1_FILE })) {
  if (!val) throw new Error(`Variable d'environnement manquante : ${nom}`);
}

// ── Répertoire des screenshots ────────────────────────────────────────────────
const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', 'sync-variables-loc-ui');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function screenshot(page, nom) {
  const p = path.join(SCREENSHOT_DIR, `${nom}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`   📸 screenshot: test-results/sync-variables-loc-ui/${nom}.png`);
}

// ── Helpers partagés ─────────────────────────────────────────────────────────
async function getToken(clientId, clientSecret, user, pass, existingToken) {
  if (existingToken) return existingToken;
  return await obtenirToken(INSTANCE, clientId, clientSecret || '', user, pass);
}

async function lancerElectron(userLabel) {
  const appPath = path.join(__dirname, '..');
  const electronApp = await electron.launch({
    args: [appPath],
    env: { ...process.env, SONAL_TEST_MODE: '1', ELECTRON_ENABLE_LOGGING: '1' },
    chromiumSandbox: false,
  });
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  console.log(`   🖥️  Electron lancé pour ${userLabel}`);
  return { electronApp, page };
}

async function ouvrirCorpusGitLab(page, token) {
  const result = await page.evaluate(
    async ({ instanceUrl, projectPath, token, branch, filePath }) => {
      return await window.electronAPI.invoke('test:ouvrir-corpus-gitlab', {
        instanceUrl, projectPath, token, branch, filePath,
      });
    },
    { instanceUrl: INSTANCE, projectPath: PROJECT, token, branch: BRANCH, filePath: CRP_FILE }
  );
  if (!result.success) throw new Error('Ouverture corpus GitLab échouée : ' + result.error);

  // Attendre que lireCorpus finisse de peupler tabVar/tabEnt
  // (inclut le chargement des entretiens depuis GitLab)
  await page.waitForTimeout(5000);
}

async function ouvrirBaseDeDonnees(page) {
  await page.click('#btn-variables');
  await page.waitForSelector('#divTabDat', { timeout: 10000 });
}

// ── État partagé entre tests ──────────────────────────────────────────────────
let crpOriginal = null;
let gitlabUser1 = null;
let tokenUser1 = null;
// ── TESTS ─────────────────────────────────────────────────────────────────────

test.describe('Synchronisation variable locuteur — UI Electron', () => {

  test.beforeAll(async () => {
    tokenUser1 = await getToken(CLIENT_ID1, CLIENT_SECRET1, USER1, PASS1, TOKEN1);
    gitlabUser1 = new GitLabAPI(INSTANCE, PROJECT, tokenUser1, BRANCH);

    // Sauvegarder le corpus original
    const crpResult = await gitlabUser1.lireFichier(CRP_FILE);
    if (!crpResult.success) throw new Error('Impossible de lire le corpus : ' + crpResult.error);
    crpOriginal = crpResult.content;

    // Réinitialiser les variables/données et ajouter tabLoc aux entretiens
    const corpus = JSON.parse(crpOriginal);
    const corpusPropre = {
      ...corpus,
      tabVar: [],
      tabDic: [],
      tabEnt: corpus.tabEnt.map((e, i) => ({
        ...e,
        tabDat: [],
        // Premier entretien : deux locuteurs nommés (index 0 = réservé, 1 et 2 = locuteurs réels)
        tabLoc: i === 0 ? ['', 'Enquêteur', 'Enquêté'] : (e.tabLoc || []),
      })),
    };
    const saveResult = await gitlabUser1.ecrireFichier(CRP_FILE, JSON.stringify(corpusPropre));
    if (!saveResult.success) throw new Error('Impossible de réinitialiser le corpus : ' + saveResult.error);
    console.log('   ✅ Corpus réinitialisé avec tabLoc = ["Enquêteur", "Enquêté"] sur entretien 1');
    await new Promise(r => setTimeout(r, 1500)); // laisser GitLab indexer
  });

  test.afterAll(async () => {
    if (crpOriginal && gitlabUser1) {
      await gitlabUser1.ecrireFichier(CRP_FILE, crpOriginal);
      console.log('   ✅ Corpus restauré à son état original');
    }
  });

  test('User1 ajoute une variable locuteur avec 2 valeurs, User2 les voit', async () => {

    // ── ÉTAPE 1 : User1 ouvre le corpus ──────────────────────────────────────
    const { electronApp: app1, page: page1 } = await lancerElectron(USER1);

    try {
      await ouvrirCorpusGitLab(page1, tokenUser1);
      await screenshot(page1, '01-user1-corpus-ouvert');
      console.log('   ✅ User1 : corpus ouvert');

      // ── ÉTAPE 2 : Ouvrir Base de données ──────────────────────────────────
      await ouvrirBaseDeDonnees(page1);
      await screenshot(page1, '02-user1-base-de-donnees-vide');
      console.log('   ✅ User1 : Base de données ouverte (vide)');

      // ── ÉTAPE 3 : Ajouter la variable "Statut" (champ = loc) ──────────────
      await page1.click('#btn-add-var');
      await page1.waitForSelector('#lblLibVar', { timeout: 5000 });

      await page1.fill('#lblLibVar', 'Statut');
      await page1.check('input[name="chkVarChmp"][value="loc"]');
      await page1.check('input[name="chkVarPriv"][value="false"]');

      await screenshot(page1, '03-user1-formulaire-variable-loc');

      await page1.click('#btnValidVar');
      // Attendre que affichDataGen() ait re-rendu le tableau avec la colonne "Statut"
      await page1.waitForFunction(() => {
        const el = document.querySelector('#divTabDat');
        return el && el.textContent.includes('Statut');
      }, { timeout: 15000 });
      await screenshot(page1, '04-user1-variable-statut-ajoutee');
      console.log('   ✅ User1 : variable "Statut" (loc) ajoutée');

      // Vérifier que la colonne "Statut" apparaît
      const contenuTable = await page1.textContent('#divTabDat');
      expect(contenuTable).toContain('Statut');

      // ── ÉTAPE 4 : Vérifier que la variable est sauvegardée sur GitLab ─────
      await page1.waitForTimeout(2000);
      const crpApresVar = await gitlabUser1.lireFichier(CRP_FILE);
      expect(crpApresVar.success).toBe(true);
      const crpDataVar = JSON.parse(crpApresVar.content);
      const varStatut = crpDataVar.tabVar.find(v => v.lib === 'Statut' && v.champ === 'loc');
      expect(varStatut).toBeTruthy();
      const vCode = varStatut.v;
      console.log(`   ✅ Variable "Statut" (v=${vCode}) présente dans le .crp GitLab`);

      // ── ÉTAPE 5 : Récupérer l'id du premier entretien ─────────────────────
      const tabEntCourant = await page1.evaluate(() => window.electronAPI.getEnt());
      expect(tabEntCourant.length).toBeGreaterThan(0);
      const premierEntId = String(tabEntCourant[0].id);

      // Vérifier que les lignes locuteurs sont visibles
      // (filtre = "all" par défaut → les lignes loc s'affichent)
      const lignesLocuteurs = await page1.locator(`td.td-editable-gen[data-var-v="${vCode}"]`).all();
      console.log(`   📋 Cellules "Statut" dans le tableau : ${lignesLocuteurs.length}`);
      expect(lignesLocuteurs.length).toBeGreaterThanOrEqual(2); // au moins 2 locuteurs

      // ── ÉTAPE 6 : Saisir "Interviewer" pour locuteur 1 (Enquêteur) ────────
      const cellLocuteur1 = page1.locator(
        `td.td-editable-gen[data-var-v="${vCode}"][data-loc="1"][data-ent-id="${premierEntId}"]`
      ).first();

      // Si le sélecteur data-ent-id n'est pas disponible, on prend la 1ère cellule
      const cellLoc1 = (await cellLocuteur1.count()) > 0
        ? cellLocuteur1
        : page1.locator(`td.td-editable-gen[data-var-v="${vCode}"][data-loc="1"]`).first();

      await cellLoc1.click();
      const inputLoc1 = page1.locator(`td.td-editable-gen[data-var-v="${vCode}"][data-loc="1"] input`).first();
      await inputLoc1.waitFor({ timeout: 5000 });
      await inputLoc1.fill('Interviewer');
      await inputLoc1.press('Enter');

      await page1.waitForTimeout(1500);
      await screenshot(page1, '05-user1-valeur-interviewer-saisie');
      console.log('   ✅ User1 : "Interviewer" saisi pour locuteur 1');

      // ── ÉTAPE 7 : Saisir "Enquêté" pour locuteur 2 ───────────────────────
      const cellLoc2 = page1.locator(`td.td-editable-gen[data-var-v="${vCode}"][data-loc="2"]`).first();
      await cellLoc2.click();
      const inputLoc2 = page1.locator(`td.td-editable-gen[data-var-v="${vCode}"][data-loc="2"] input`).first();
      await inputLoc2.waitFor({ timeout: 5000 });
      await inputLoc2.fill('Enquêté');
      await inputLoc2.press('Enter');

      await page1.waitForTimeout(2000);
      await screenshot(page1, '06-user1-valeur-enquete-saisie');
      console.log('   ✅ User1 : "Enquêté" saisi pour locuteur 2');

      // ── ÉTAPE 8 : Vérifier les deux valeurs dans le .crp sur GitLab ───────
      await page1.waitForTimeout(1500);
      const crpFinal = await gitlabUser1.lireFichier(CRP_FILE);
      expect(crpFinal.success).toBe(true);
      const crpDataFinal = JSON.parse(crpFinal.content);

      // Les valeurs sont dans tabEnt[0].tabDat
      const premierEnt = crpDataFinal.tabEnt[0];
      const tabDatEnt = premierEnt.tabDat || [];
      console.log(`   📊 tabDat de l'entretien 1 : ${JSON.stringify(tabDatEnt)}`);

      const datLoc1 = tabDatEnt.find(d => d.v == vCode && d.l == 1);
      const datLoc2 = tabDatEnt.find(d => d.v == vCode && d.l == 2);
      expect(datLoc1).toBeTruthy();
      expect(datLoc2).toBeTruthy();

      // Les deux modalités doivent être dans tabDic
      const dicLoc1 = crpDataFinal.tabDic.find(d => d.v == vCode && d.m == datLoc1.m);
      const dicLoc2 = crpDataFinal.tabDic.find(d => d.v == vCode && d.m == datLoc2.m);
      expect(dicLoc1 && dicLoc1.lib).toBe('Interviewer');
      expect(dicLoc2 && dicLoc2.lib).toBe('Enquêté');
      console.log(`   ✅ tabDic contient bien "Interviewer" (m=${datLoc1.m}) et "Enquêté" (m=${datLoc2.m})`);

    } finally {
      await app1.close();
      console.log('   🔒 Electron User1 fermé');
    }

    // ── ÉTAPE 9 : User2 ouvre le corpus et vérifie les deux valeurs ──────────
    const token2 = await getToken(CLIENT_ID2, CLIENT_SECRET2, USER2, PASS2, TOKEN2);
    const { electronApp: app2, page: page2 } = await lancerElectron(USER2);

    try {
      await ouvrirCorpusGitLab(page2, token2);
      await screenshot(page2, '07-user2-corpus-ouvert');
      console.log('   ✅ User2 : corpus ouvert');

      await ouvrirBaseDeDonnees(page2);
      await screenshot(page2, '08-user2-base-de-donnees');
      console.log('   ✅ User2 : Base de données ouverte');

      // Colonne "Statut" visible
      const contenuUser2 = await page2.textContent('#divTabDat');
      expect(contenuUser2).toContain('Statut');
      console.log('   ✅ User2 : colonne "Statut" visible');

      // Vérifier la présence des deux valeurs dans les cellules
      const crpLu = JSON.parse((await gitlabUser1.lireFichier(CRP_FILE)).content);
      const vCodeLu = crpLu.tabVar.find(v => v.lib === 'Statut').v;

      const cellLoc1User2 = await page2.locator(`td.td-editable-gen[data-var-v="${vCodeLu}"][data-loc="1"]`).first().textContent();
      const cellLoc2User2 = await page2.locator(`td.td-editable-gen[data-var-v="${vCodeLu}"][data-loc="2"]`).first().textContent();

      console.log(`   📋 User2 — locuteur 1 "Statut" : "${cellLoc1User2}"`);
      console.log(`   📋 User2 — locuteur 2 "Statut" : "${cellLoc2User2}"`);

      expect(cellLoc1User2).toBe('Interviewer');
      expect(cellLoc2User2).toBe('Enquêté');

      await screenshot(page2, '09-user2-deux-valeurs-visibles');
      console.log('   🎉 Les deux valeurs locuteur sont bien synchronisées chez User2');

    } finally {
      await app2.close();
      console.log('   🔒 Electron User2 fermé');
    }
  });
});
