/**
 * Test E2E — Premier entretien dans un projet GitLab vide (sans .crp)
 *
 * Contexte :
 *  Un chercheur vient de créer un projet GitLab pour son corpus.
 *  Le dépôt ne contient que .gitattributes (LFS configuré).
 *  Il n'y a PAS encore de .crp — il va ajouter son premier entretien.
 *
 * Ce test valide le comportement corrigé dans main.js :
 *  Avant correction : SonalPi échouait au chargement si le .crp n'existait pas.
 *  Après correction : si le .crp est absent, SonalPi en crée un vide automatiquement.
 *
 * Scénario testé ici (couche API, sans Electron) :
 *  1. Vérifier que le .crp existe et le sauvegarder, puis le supprimer (simulation projet vide)
 *  2. Vérifier que lireFichier échoue bien (404)
 *  3. Simuler la logique corrigée : créer un corpus vide si le .crp est absent
 *  4. Vérifier que le corpus vide est bien présent et valide
 *  5. Ajouter le premier entretien (.sonal) et mettre à jour le .crp
 *  6. Vérifier le .crp → 1 entretien
 *  7. user2 voit le corpus et l'entretien
 *  8. Nettoyage : restaurer l'état initial
 *
 * Lancement :
 *   npm run test:premier
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
  GITLAB_CRP: CRP_FILE,
} = process.env;

for (const [nom, val] of Object.entries({ INSTANCE, CLIENT_ID, PROJECT, USER1, PASS1, USER2, PASS2, CRP_FILE })) {
  if (!val) throw new Error(`Variable d'environnement manquante : ${nom}`);
}

const PREMIER_ENTRETIEN = 'premier-entretien.sonal';

// ── Utilitaires ───────────────────────────────────────────────────────────────

function parseCrp(content) {
  return JSON.parse(content);
}

function creerSonalMinimal(nom = 'premier-entretien') {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${nom}</title></head>
<body>
<script id="loc-json" type="application/json">
        {
            ["","Enquêteur","Premier enquêté"]
        }
</script>
<script id="cat-json" type="application/json">{ [] }</script>
<script id="var-json" type="application/json">{ [] }</script>
<script id="dic-json" type="application/json">{ [] }</script>
<script id="dat-json" type="application/json">{ null }</script>
<script id="anon-json" type="application/json">
        {
            [{"entite":"","remplacement":"","occurrences":0,"indexCourant":0,"matchPositions":[]}]
        }
</script>
<div id="contenuText">
<span class="lblseg sautlig ligloc" data-deb="0.0" data-fin="5.0" data-loc="1" tabindex="1" data-rksg="0"><span class="" data-rk="1" data-sg="0" data-len="4">Comment s'est passée votre enfance ?</span></span><span class="lblseg sautlig" data-deb="5.1" data-fin="20.0" data-loc="2" tabindex="6" data-rksg="1"><span class="" data-rk="6" data-sg="1" data-len="15">Mon enfance s'est bien passée, j'ai grandi à Lyon dans une famille nombreuse.</span></span>
</div>
</body>
</html>`;
}

/**
 * Simule la logique corrigée de ouvrirCorpusGitLab :
 * Si le .crp n'existe pas → créer un corpus vide
 * Sinon → lire normalement
 * Retourne { content, created } (created=true si nouveau)
 */
async function ouvrirOuCreerCorpus(api, filePath) {
  const existe = await api.verifierExistence(filePath);
  if (!existe) {
    const corpusVide = JSON.stringify({ tabThm: [], tabEnt: [], tabVar: [], tabDic: [] });
    const creation = await api.ecrireFichier(filePath, corpusVide);
    if (!creation.success) throw new Error('Impossible de créer le corpus vide : ' + creation.error);
    return { content: corpusVide, created: true };
  }
  const lecture = await api.lireFichier(filePath);
  if (!lecture.success) throw new Error('Impossible de lire le corpus : ' + lecture.error);
  return { content: lecture.content, created: false };
}

// ── État partagé ───────────────────────────────────────────────────────────────

let api1, api2;
let crpSauvegarde;    // contenu original du .crp avant suppression
let crpSauvegardeBool = false; // true si le .crp a été sauvegardé

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

  // Nettoyage préventif
  await api1.deverrouillerFichier(PREMIER_ENTRETIEN).catch(() => {});
  const existe3 = await api1.verifierExistence(PREMIER_ENTRETIEN).catch(() => false);
  if (existe3) await api1.supprimerFichier(PREMIER_ENTRETIEN).catch(() => {});

  // Sauvegarder le .crp original s'il existe
  const lectCrp = await api1.lireFichier(CRP_FILE).catch(() => ({ success: false }));
  if (lectCrp.success) {
    crpSauvegarde = lectCrp.content;
    crpSauvegardeBool = true;
    console.log(`✅ .crp sauvegardé (${parseCrp(crpSauvegarde).tabEnt.length} entretiens)`);
  }

  console.log('');
});

test.afterAll(async () => {
  if (!api1) return;
  console.log('\n🧹 Nettoyage afterAll...');

  // Supprimer premier-entretien.sonal s'il existe
  await api1.deverrouillerFichier(PREMIER_ENTRETIEN).catch(() => {});
  const existePremier = await api1.verifierExistence(PREMIER_ENTRETIEN).catch(() => false);
  if (existePremier) {
    await api1.supprimerFichier(PREMIER_ENTRETIEN);
    console.log('   ✅ premier-entretien.sonal supprimé');
  }

  // Restaurer le .crp original
  if (crpSauvegardeBool) {
    const crpActuel = await api1.lireFichier(CRP_FILE).catch(() => ({ success: false }));
    if (crpActuel.success && crpActuel.content !== crpSauvegarde) {
      await api1.ecrireFichier(CRP_FILE, crpSauvegarde);
      console.log('   ✅ .crp restauré');
    }
  } else {
    // Le .crp n'existait pas au départ — le supprimer
    const existeCrp = await api1.verifierExistence(CRP_FILE).catch(() => false);
    if (existeCrp) {
      await api1.supprimerFichier(CRP_FILE);
      console.log('   ✅ .crp supprimé (n\'existait pas au départ)');
    }
  }
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test('1 — simulation projet vide : suppression du .crp', async () => {
  // Supprimer le .crp pour simuler un projet GitLab fraîchement créé
  if (crpSauvegardeBool) {
    const suppr = await api1.supprimerFichier(CRP_FILE);
    expect(suppr.success, 'suppression .crp doit réussir').toBe(true);
  }

  // Vérifier qu'il n'existe plus
  const existe = await api1.verifierExistence(CRP_FILE);
  expect(existe, '.crp ne doit pas exister').toBe(false);

  console.log('   ✅ Projet simulé sans .crp');
});

test('2 — lireFichier échoue bien quand le .crp est absent', async () => {
  // Sans le .crp, lireFichier doit retourner success: false
  const lecture = await api1.lireFichier(CRP_FILE);
  expect(lecture.success, 'lecture d\'un .crp absent doit échouer').toBe(false);

  // L'erreur doit être présente
  expect(lecture.error).toBeTruthy();
  console.log(`   ✅ Erreur correctement retournée : "${lecture.error}"`);
  console.log(`   ℹ️ Avant correction, SonalPi s'arrêtait ici avec une erreur bloquante`);
});

test('3 — ouvrirOuCreerCorpus crée automatiquement un corpus vide', async () => {
  // Simuler la logique corrigée de ouvrirCorpusGitLab
  const { content, created } = await ouvrirOuCreerCorpus(api1, CRP_FILE);

  expect(created, 'le corpus doit avoir été créé (pas trouvé)').toBe(true);
  expect(content).toBeTruthy();

  // Vérifier que le JSON est valide et a la bonne structure
  const crp = parseCrp(content);
  expect(Array.isArray(crp.tabThm), 'tabThm doit être un tableau').toBe(true);
  expect(Array.isArray(crp.tabEnt), 'tabEnt doit être un tableau').toBe(true);
  expect(Array.isArray(crp.tabVar), 'tabVar doit être un tableau').toBe(true);
  expect(Array.isArray(crp.tabDic), 'tabDic doit être un tableau').toBe(true);
  expect(crp.tabEnt.length, 'corpus vide : 0 entretiens').toBe(0);

  // Vérifier que le .crp existe maintenant sur GitLab
  const existe = await api1.verifierExistence(CRP_FILE);
  expect(existe, '.crp doit exister après création automatique').toBe(true);

  console.log('   ✅ Corpus vide créé automatiquement');
  console.log(`   Structure : tabThm=${crp.tabThm.length}, tabEnt=${crp.tabEnt.length}, tabVar=${crp.tabVar.length}`);
});

test('4 — user2 voit le corpus vide dès sa création', async () => {
  const lecture = await api2.lireFichier(CRP_FILE);
  expect(lecture.success).toBe(true);

  const crp = parseCrp(lecture.content);
  expect(crp.tabEnt.length, 'user2 voit 0 entretiens').toBe(0);

  console.log('   ✅ user2 accède au corpus vide');
  console.log('   ℹ️ Prêt pour l\'ajout du premier entretien');
});

test('5 — user1 ajoute le premier entretien (.sonal)', async () => {
  const contenuSonal = creerSonalMinimal('premier-entretien');

  // Vérifier qu'il n'existe pas
  const existeAvant = await api1.verifierExistence(PREMIER_ENTRETIEN);
  expect(existeAvant, 'sonal ne doit pas exister encore').toBe(false);

  // Créer le .sonal (POST — nouveau fichier → stocké en LFS)
  const ecriture = await api1.ecrireFichier(PREMIER_ENTRETIEN, contenuSonal);
  expect(ecriture.success, 'création premier-entretien.sonal doit réussir').toBe(true);

  // Vérifier qu'il existe
  const existeApres = await api1.verifierExistence(PREMIER_ENTRETIEN);
  expect(existeApres, 'sonal doit exister après création').toBe(true);

  console.log(`   ✅ premier-entretien.sonal créé (${contenuSonal.length} chars, 2 segments)`);
});

test('6 — user1 met à jour le .crp avec le premier entretien', async () => {
  // Lire le corpus vide actuel
  const lectureCrp = await api1.lireFichier(CRP_FILE);
  expect(lectureCrp.success).toBe(true);

  const crp = parseCrp(lectureCrp.content);
  expect(crp.tabEnt.length, 'doit partir de 0').toBe(0);

  // Ajouter l'entrée tabEnt
  const nouvelleEntree = {
    id: 1,
    notes: '',
    tabLoc: ['', 'Enquêteur', 'Premier enquêté'],
    nom: 'premier-entretien',
    hms: '00:00:00',
    tabThm: [],
    rtrPath: PREMIER_ENTRETIEN,
    audioPath: '',
    imgPath: '',
    tabVar: [],
    tabDic: [],
    tabDat: null,
    tabAnon: [{ entite: '', remplacement: '', occurrences: 0, indexCourant: 0, matchPositions: [] }],
  };

  const crpMisAJour = { ...crp, tabEnt: [nouvelleEntree] };
  const ecriture = await api1.ecrireFichier(CRP_FILE, JSON.stringify(crpMisAJour));
  expect(ecriture.success, 'mise à jour .crp doit réussir').toBe(true);

  // Vérifier la persistance
  const relecture = await api1.lireFichier(CRP_FILE);
  expect(relecture.success).toBe(true);
  const crpRelu = parseCrp(relecture.content);
  expect(crpRelu.tabEnt.length, '.crp doit avoir 1 entretien').toBe(1);
  expect(crpRelu.tabEnt[0].rtrPath).toBe(PREMIER_ENTRETIEN);
  expect(crpRelu.tabEnt[0].nom).toBe('premier-entretien');

  console.log(`   ✅ .crp mis à jour : 1 entretien (id ${crpRelu.tabEnt[0].id})`);
});

test('7 — user2 voit le premier entretien et peut le lire', async () => {
  // Vérifier le .crp
  const lectureCrp = await api2.lireFichier(CRP_FILE);
  expect(lectureCrp.success).toBe(true);
  const crp = parseCrp(lectureCrp.content);
  expect(crp.tabEnt.length, 'user2 voit 1 entretien').toBe(1);
  expect(crp.tabEnt[0].rtrPath).toBe(PREMIER_ENTRETIEN);

  // Lire le .sonal
  const lectureSonal = await api2.lireFichier(PREMIER_ENTRETIEN);
  expect(lectureSonal.success, 'user2 peut lire le .sonal').toBe(true);

  const html = lectureSonal.content;
  expect(html).toContain('contenuText');
  expect(html).toContain('lblseg');
  const nbSegs = (html.match(/class="lblseg /g) || []).length;
  expect(nbSegs, 'doit avoir des segments').toBeGreaterThan(0);

  console.log(`   ✅ user2 voit l'entretien "${crp.tabEnt[0].nom}" et peut le lire (${nbSegs} segments)`);
});

test('8 — nettoyage : suppression et restauration', async () => {
  // Supprimer premier-entretien.sonal
  const supprSonal = await api1.supprimerFichier(PREMIER_ENTRETIEN);
  expect(supprSonal.success).toBe(true);

  // Restaurer le .crp original (ou supprimer le .crp créé si le projet était vraiment vide)
  if (crpSauvegardeBool) {
    const ecriture = await api1.ecrireFichier(CRP_FILE, crpSauvegarde);
    expect(ecriture.success).toBe(true);
    const relecture = await api1.lireFichier(CRP_FILE);
    const crp = parseCrp(relecture.content);
    console.log(`   ✅ .crp restauré (${crp.tabEnt.length} entretiens)`);
  } else {
    const supprCrp = await api1.supprimerFichier(CRP_FILE);
    expect(supprCrp.success).toBe(true);
    console.log('   ✅ .crp supprimé (projet retourné à l\'état initial)');
  }

  console.log('   ✅ premier-entretien.sonal supprimé');
});
