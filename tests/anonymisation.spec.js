/**
 * Test E2E — Anonymisation d'un fichier .sonal
 *
 * Contexte :
 *  Un fichier .sonal stocke la table d'anonymisation dans le bloc <script id="anon-json">.
 *  La structure est : [{entite, remplacement, occurrences, indexCourant, matchPositions}]
 *  Le texte original (contenuText) est conservé intact ; seul le tabAnon évolue.
 *
 * Scénario :
 *  1. Lire le fichier et vérifier la présence du bloc anon-json
 *  2. Ajouter deux entrées d'anonymisation (Karine → Alice, banlieue parisienne → [lieu])
 *     et vérifier que les occurrences sont bien comptées dans le texte
 *  3. user1 verrouille, sauvegarde la table anon mise à jour, libère
 *  4. user2 lit et voit la table anon correcte
 *  5. user1 ajoute une exception (une occurrence exclue de l'anonymisation)
 *     et vérifie que matchPositions l'enregistre
 *  6. user1 supprime une entrée anon (réinitialisation de la ligne à zéro occurrence)
 *     et vérifie que le texte original est toujours intact
 *  7. Restauration complète
 *
 * Lancement :
 *   npm run test:anon
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
} = process.env;

for (const [nom, val] of Object.entries({ INSTANCE, CLIENT_ID, PROJECT, USER1, PASS1, USER2, PASS2, ENTRETIEN1 })) {
  if (!val) throw new Error(`Variable d'environnement manquante : ${nom}`);
}

// ── Utilitaires (simuler ce que fait SonalPi côté renderer) ──────────────────

/**
 * Extrait le tableau anon-json depuis le HTML du fichier .sonal
 * Le bloc a la forme :
 *   <script id="anon-json" type="application/json">
 *       {  [ ... ]  }
 *   </script>
 * Approche string-based pour éviter les problèmes de regex avec JSON imbriqué.
 */
function extraireAnonJson(html) {
  const startTag = '<script id="anon-json"';
  const endTag = '</script>';

  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) throw new Error('Bloc anon-json introuvable dans le fichier .sonal');

  const contentStart = html.indexOf('>', startIdx) + 1;
  const contentEnd = html.indexOf(endTag, contentStart);
  const scriptContent = html.slice(contentStart, contentEnd);

  const arrayStart = scriptContent.indexOf('[');
  const arrayEnd = scriptContent.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) throw new Error('Tableau JSON introuvable dans le bloc anon-json');

  return JSON.parse(scriptContent.slice(arrayStart, arrayEnd + 1));
}

/**
 * Injecte un tableau anon mis à jour dans le HTML
 * Remplace le [ ... ] à l'intérieur du script tag anon-json.
 * Approche string-based, robuste face aux { } imbriqués dans le JSON.
 */
function injecterAnonJson(html, tabAnon) {
  const jsonStr = JSON.stringify(tabAnon);
  const startTag = '<script id="anon-json"';
  const endTag = '</script>';

  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return html;

  const contentStart = html.indexOf('>', startIdx) + 1;
  const contentEnd = html.indexOf(endTag, contentStart);
  const scriptContent = html.slice(contentStart, contentEnd);

  const arrayStart = scriptContent.indexOf('[');
  const arrayEnd = scriptContent.lastIndexOf(']');
  if (arrayStart === -1 || arrayEnd === -1) return html;

  const newScriptContent =
    scriptContent.slice(0, arrayStart) + jsonStr + scriptContent.slice(arrayEnd + 1);

  return html.slice(0, contentStart) + newScriptContent + html.slice(contentEnd);
}

/**
 * Compte le nombre d'occurrences (non-vides dans le texte) d'une chaîne
 * dans le bloc contenuText du HTML — en cherchant dans les spans data-rk
 * Simule ce que fait appliquerAnonymisationPour() dans le renderer
 */
function compterOccurrencesDansHtml(html, entite) {
  // Extraire le bloc contenuText
  const contenuMatch = html.match(/<div id="contenuText">([\s\S]*?)<\/div>\s*<\/body>/);
  if (!contenuMatch) return 0;
  const contenu = contenuMatch[1];

  // Échapper pour la regex
  const entiteEchappee = entite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(entiteEchappee, 'gi');
  return (contenu.match(regex) || []).length;
}

/**
 * Crée une nouvelle entrée d'anonymisation avec occurrences comptées
 */
function creerEntreeAnon(html, entite, remplacement) {
  const occurrences = compterOccurrencesDansHtml(html, entite);
  // Simuler des matchPositions simples (positions fictives pour le test)
  const matchPositions = [];
  for (let i = 0; i < occurrences; i++) {
    matchPositions.push({ start: i * 10, end: i * 10 + entite.length, isException: false });
  }
  return {
    entite,
    remplacement,
    occurrences,
    indexCourant: 0,
    matchPositions,
  };
}

// ── État partagé ───────────────────────────────────────────────────────────────

let api1, api2;
let contenuOriginal;
let tabAnonOriginal;

// ── Setup ──────────────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  console.log('\n🔐 Authentification OAuth — user1...');
  const token1 = await obtenirTokenOAuth(INSTANCE, CLIENT_ID, CLIENT_SECRET, USER1, PASS1);
  console.log('🔐 Authentification OAuth — user2...');
  const token2 = await obtenirTokenOAuth(INSTANCE, CLIENT_ID, CLIENT_SECRET, USER2, PASS2);

  api1 = new GitLabAPI(INSTANCE, PROJECT, token1, BRANCH);
  api2 = new GitLabAPI(INSTANCE, PROJECT, token2, BRANCH);

  await api1.testerConnexion();
  await api2.testerConnexion();

  await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});

  const lecture = await api1.lireFichier(ENTRETIEN1);
  if (!lecture.success) throw new Error(`Impossible de lire ${ENTRETIEN1} : ${lecture.error}`);
  contenuOriginal = lecture.content;
  tabAnonOriginal = extraireAnonJson(contenuOriginal);

  console.log(`✅ Fichier chargé : ${contenuOriginal.length} caractères`);
  console.log(`   Table anon initiale : ${tabAnonOriginal.length} entrées`);
  console.log('');
});

test.afterAll(async () => {
  if (api1 && contenuOriginal) {
    const lecture = await api1.lireFichier(ENTRETIEN1).catch(() => ({ success: false }));
    if (lecture.success && lecture.content !== contenuOriginal) {
      console.log('\n🔄 Restauration afterAll...');
      await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
      const v = await api1.verrouillerFichier(ENTRETIEN1).catch(() => ({ success: false }));
      if (v.success) {
        await api1.ecrireFichier(ENTRETIEN1, contenuOriginal);
        await api1.deverrouillerFichier(ENTRETIEN1);
      }
    }
  }
  await api1?.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2?.deverrouillerFichier(ENTRETIEN1).catch(() => {});
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test('1 — le bloc anon-json est présent et parseable', async () => {
  expect(contenuOriginal).toContain('anon-json');

  const tabAnon = extraireAnonJson(contenuOriginal);
  expect(Array.isArray(tabAnon)).toBe(true);
  console.log(`   Table anon : ${tabAnon.length} entrées`);

  // Vérifier la structure de chaque entrée
  for (const entree of tabAnon) {
    expect(entree).toHaveProperty('entite');
    expect(entree).toHaveProperty('remplacement');
    expect(entree).toHaveProperty('occurrences');
    expect(entree).toHaveProperty('matchPositions');
  }
  console.log(`   ✅ Structure anon-json valide`);
});

test('2 — compter les occurrences de "Karine" dans le texte', async () => {
  const nb = compterOccurrencesDansHtml(contenuOriginal, 'Karine');
  expect(nb, '"Karine" doit apparaître au moins une fois dans l\'entretien').toBeGreaterThan(0);
  console.log(`   "Karine" : ${nb} occurrence(s) dans le texte`);

  // Vérifier aussi une entité absente
  const nbAbsent = compterOccurrencesDansHtml(contenuOriginal, 'XYZXYZ_entite_absente');
  expect(nbAbsent).toBe(0);
  console.log(`   ✅ Comptage des occurrences fonctionnel`);
});

test('3 — user1 ajoute des entrées d\'anonymisation et sauvegarde (LFS)', async () => {
  // Créer les entrées
  const entreeKarine = creerEntreeAnon(contenuOriginal, 'Karine', 'Alice');
  const entreeLieu = creerEntreeAnon(contenuOriginal, 'banlieue parisienne', '[lieu]');

  console.log(`   "Karine" → "Alice" : ${entreeKarine.occurrences} occurrence(s)`);
  console.log(`   "banlieue parisienne" → "[lieu]" : ${entreeLieu.occurrences} occurrence(s)`);

  expect(entreeKarine.occurrences).toBeGreaterThan(0);
  expect(entreeLieu.occurrences).toBeGreaterThan(0);

  // Construire la nouvelle table anon (garder les lignes vides, ajouter les nouvelles)
  const lignesVides = tabAnonOriginal.filter(e => !e.entite.trim());
  const nouvelleTable = [entreeKarine, entreeLieu, ...lignesVides];

  // Injecter dans le HTML
  const contenuModifie = injecterAnonJson(contenuOriginal, nouvelleTable);

  // Vérifier que l'injection n'a pas cassé le reste
  expect(contenuModifie).toContain('contenuText');
  expect(contenuModifie).toContain('Karine'); // texte original intact
  expect(contenuModifie).toContain('"Alice"'); // pseudo dans anon-json

  // Sauvegarder avec verrou
  await api1.verrouillerFichier(ENTRETIEN1);
  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuModifie);
  expect(ecriture.success).toBe(true);
  await api1.deverrouillerFichier(ENTRETIEN1);

  console.log(`   ✅ Table anon sauvegardée (${contenuModifie.length} caractères)`);
});

test('4 — user2 lit et voit la table anon correcte', async () => {
  const lecture = await api2.lireFichier(ENTRETIEN1);
  expect(lecture.success).toBe(true);

  const tabAnon = extraireAnonJson(lecture.content);
  const entreeAlice = tabAnon.find(e => e.remplacement === 'Alice');
  const entreeLieu = tabAnon.find(e => e.remplacement === '[lieu]');

  expect(entreeAlice, 'user2 doit voir l\'entrée Alice').toBeTruthy();
  expect(entreeAlice.entite).toBe('Karine');
  expect(entreeAlice.occurrences).toBeGreaterThan(0);

  expect(entreeLieu, 'user2 doit voir l\'entrée [lieu]').toBeTruthy();
  expect(entreeLieu.occurrences).toBeGreaterThan(0);

  // Texte original doit être intact
  expect(lecture.content, '"Karine" doit rester dans le texte brut').toContain('Karine');
  expect(lecture.content, 'le texte ne doit PAS contenir "Alice" dans le corps').not.toMatch(
    /<div id="contenuText">[\s\S]*?Alice[\s\S]*?<\/div>/
  );

  console.log(`   ✅ user2 voit : Karine→Alice (${entreeAlice.occurrences} occ.), banlieue→[lieu] (${entreeLieu.occurrences} occ.)`);
  console.log(`   ✅ Texte original préservé ("Karine" toujours dans contenuText)`);
});

test('5 — user1 marque une occurrence comme exception et sauvegarde', async () => {
  const lecture = await api1.lireFichier(ENTRETIEN1);
  expect(lecture.success).toBe(true);
  let tabAnon = extraireAnonJson(lecture.content);

  // Trouver l'entrée Karine et marquer la première occurrence comme exception
  const idxKarine = tabAnon.findIndex(e => e.entite === 'Karine');
  expect(idxKarine, 'entrée Karine doit exister').toBeGreaterThanOrEqual(0);

  if (tabAnon[idxKarine].matchPositions.length > 0) {
    tabAnon[idxKarine].matchPositions[0].isException = true;
  }

  const occurrencesTotal = tabAnon[idxKarine].occurrences;
  const exceptions = tabAnon[idxKarine].matchPositions.filter(m => m.isException).length;
  console.log(`   Karine : ${occurrencesTotal} occ. dont ${exceptions} exception(s)`);

  const contenuMaj = injecterAnonJson(lecture.content, tabAnon);

  await api1.verrouillerFichier(ENTRETIEN1);
  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuMaj);
  expect(ecriture.success).toBe(true);
  await api1.deverrouillerFichier(ENTRETIEN1);

  // Relire et vérifier
  const relecture = await api1.lireFichier(ENTRETIEN1);
  const tabAnonRelu = extraireAnonJson(relecture.content);
  const entreeReluKarine = tabAnonReluFn(tabAnonRelu);
  const excRelue = entreeReluKarine?.matchPositions?.filter(m => m.isException).length || 0;
  expect(excRelue).toBe(1);
  console.log(`   ✅ Exception persistée : ${excRelue} occurrence(s) exclue(s) après roundtrip`);

  function tabAnonReluFn(tab) { return tab.find(e => e.entite === 'Karine'); }
});

test('6 — user1 supprime l\'anonymisation et restaure le fichier original', async () => {
  // Remettre le contenu original
  await api1.verrouillerFichier(ENTRETIEN1);
  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuOriginal);
  expect(ecriture.success).toBe(true);
  await api1.deverrouillerFichier(ENTRETIEN1);

  // Vérifier la restauration
  const relecture = await api1.lireFichier(ENTRETIEN1);
  expect(relecture.success).toBe(true);
  expect(relecture.content).toBe(contenuOriginal);

  // La table anon doit être revenue à l'état initial
  const tabAnonRestauree = extraireAnonJson(relecture.content);
  expect(tabAnonRestauree.length).toBe(tabAnonOriginal.length);
  expect(
    tabAnonRestauree.every(e => !e.entite.trim()),
    'toutes les entrées doivent être vides (état initial)'
  ).toBe(true);

  console.log(`   ✅ Fichier restauré — table anon : ${tabAnonRestauree.length} entrées vides`);
  console.log(`   ✅ "Karine" toujours dans le texte (jamais remplacé dans le HTML brut)`);
});
