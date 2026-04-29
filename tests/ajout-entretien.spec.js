/**
 * Test E2E — Ajout d'un nouvel entretien dans un corpus GitLab existant
 *
 * Contexte :
 *  Le corpus GitLab contient :
 *   - corpus-test.crp  : JSON avec tabThm, tabEnt (2 entrées), tabVar, tabDic
 *   - entretien1.sonal : HTML Sonal (stocké en LFS)
 *   - entretien2.sonal : HTML Sonal (stocké en LFS)
 *
 * Scénario (ce que SonalPi fait lors d'un ajout d'entretien en mode distant) :
 *  1. user1 lit le .crp et vérifie qu'il y a bien 2 entretiens
 *  2. user1 crée entretien3.sonal (fichier .sonal minimal valide) sur GitLab
 *  3. user1 met à jour le .crp pour ajouter l'entrée tabEnt
 *  4. user2 lit le .crp et voit 3 entretiens
 *  5. user2 lit entretien3.sonal et vérifie sa structure
 *  6. user1 verrouille entretien3.sonal et y fait des modifications
 *  7. user1 supprime entretien3.sonal et restaure le .crp original (nettoyage)
 *
 * Lancement :
 *   npm run test:ajout
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
  GITLAB_ENTRETIEN1: ENTRETIEN1,
} = process.env;

for (const [nom, val] of Object.entries({ INSTANCE, PROJECT, USER1, USER2, CRP_FILE, ENTRETIEN1 })) {
  if (!val) throw new Error(`Variable d'environnement manquante : ${nom}`);
}

const NOUVEL_ENTRETIEN = 'entretien3.sonal';

// ── Utilitaires ───────────────────────────────────────────────────────────────

/**
 * Parse le contenu JSON du .crp
 */
function parseCrp(content) {
  return JSON.parse(content);
}

/**
 * Sérialise le .crp en JSON (format attendu par SonalPi)
 */
function serializeCrp(crp) {
  return JSON.stringify(crp);
}

/**
 * Crée un fichier .sonal minimal valide pour un nouvel entretien
 * Simule ce que fait sauvHtml() dans gestion_fichiers.js
 */
function creerSonalMinimal(nomEntretien, locuteurs = ['', 'Enquêteur', 'Enquêté']) {
  const locJSON = JSON.stringify(locuteurs);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fichier Whispurge</title>
  <link href="http://www.sonal-info.com/WHSPRG/CSS/Styles.css" rel="stylesheet" type="text/css">
</head>
<body>
<script id="loc-json" type="application/json">
        {
            ${locJSON}
        }
</script>
<script id="cat-json" type="application/json">
        {
            []
        }
</script>
<script id="var-json" type="application/json">
        {
            []
        }
</script>
<script id="dic-json" type="application/json">
        {
            []
        }
</script>
<script id="dat-json" type="application/json">
        {
            null
        }
</script>
<script id="anon-json" type="application/json">
        {
            [{"entite":"","remplacement":"","occurrences":0,"indexCourant":0,"matchPositions":[]},{"entite":"","remplacement":"","occurrences":0,"indexCourant":0,"matchPositions":[]}]
        }
</script>

    <div style="margin: 40px;">
    <H2>Notes</H2>
    <div id="txtnotes"></div>
    </div>
     <div id="contenuText">
<span class="lblseg sautlig ligloc" data-deb="0.0" data-fin="3.0" data-loc="1" tabindex="1" data-rksg="0" data-nomloc="Enquêteur"><span class="" data-rk="1" data-sg="0" data-len="5">Bonjour, pouvez-vous vous présenter ? </span></span><span class="lblseg sautlig" data-deb="3.1" data-fin="8.0" data-loc="2" tabindex="6" data-rksg="1"><span class="" data-rk="6" data-sg="1" data-len="10">Bonjour, je m'appelle Martin, j'ai 35 ans. </span></span><span class="lblseg sautlig" data-deb="8.1" data-fin="15.0" data-loc="2" tabindex="16" data-rksg="2"><span class="" data-rk="16" data-sg="2" data-len="18">Je travaille dans l'enseignement depuis une dizaine d'années. </span></span>
</div></body>
</html>`;
}

/**
 * Crée une entrée tabEnt pour un nouvel entretien
 * Simule ce que fait ajouterEntretien() dans gestion_entretiens.js
 */
function creerEntreeTabEnt(id, nomFichier, tabThm = [], tabVar = [], tabDic = []) {
  const nom = nomFichier.replace(/\.sonal$/i, '');
  return {
    id,
    notes: '',
    tabLoc: ['', 'Enquêteur', 'Enquêté'],
    nom,
    hms: '00:00:00',
    tabThm: tabThm.slice(),
    rtrPath: nomFichier,
    audioPath: '',
    imgPath: '',
    tabVar: tabVar.slice(),
    tabDic: tabDic.slice(),
    tabDat: null,
    tabAnon: [
      { entite: '', remplacement: '', occurrences: 0, indexCourant: 0, matchPositions: [] },
      { entite: '', remplacement: '', occurrences: 0, indexCourant: 0, matchPositions: [] },
    ],
  };
}

// ── État partagé ───────────────────────────────────────────────────────────────

let api1, api2;
let crpOriginal;
let crpOriginalContent;

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

  // Nettoyage préventif : supprimer entretien3.sonal s'il existe déjà
  await api1.deverrouillerFichier(NOUVEL_ENTRETIEN).catch(() => {});

  // Lire et sauvegarder le .crp original
  const lectureCrp = await api1.lireFichier(CRP_FILE);
  if (!lectureCrp.success) throw new Error(`Impossible de lire ${CRP_FILE} : ${lectureCrp.error}`);
  crpOriginalContent = lectureCrp.content;
  crpOriginal = parseCrp(crpOriginalContent);

  console.log(`✅ Corpus chargé : ${crpOriginal.tabEnt.length} entretiens, ${crpOriginal.tabThm?.length || 0} thématiques`);
  console.log('');
});

test.afterAll(async () => {
  if (!api1 || !crpOriginalContent) return;
  console.log('\n🧹 Nettoyage afterAll...');

  // Supprimer entretien3.sonal s'il existe
  await api1.deverrouillerFichier(NOUVEL_ENTRETIEN).catch(() => {});
  const existe3 = await api1.verifierExistence(NOUVEL_ENTRETIEN).catch(() => false);
  if (existe3) {
    await api1.supprimerFichier(NOUVEL_ENTRETIEN);
  }

  // Restaurer le .crp si modifié
  const crpActuel = await api1.lireFichier(CRP_FILE).catch(() => ({ success: false }));
  if (crpActuel.success && crpActuel.content !== crpOriginalContent) {
    await api1.ecrireFichier(CRP_FILE, crpOriginalContent);
    console.log('   ✅ .crp restauré');
  }
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test('1 — le .crp contient bien 2 entretiens initialement', async () => {
  expect(crpOriginal.tabEnt).toBeDefined();
  expect(Array.isArray(crpOriginal.tabEnt)).toBe(true);
  expect(crpOriginal.tabEnt.length, 'doit avoir 2 entretiens').toBe(2);

  // Vérifier la structure de chaque entrée
  for (const ent of crpOriginal.tabEnt) {
    expect(ent).toHaveProperty('id');
    expect(ent).toHaveProperty('nom');
    expect(ent).toHaveProperty('rtrPath');
    expect(ent.rtrPath).toMatch(/\.sonal$/i);
  }

  console.log(`   Entretiens : ${crpOriginal.tabEnt.map(e => e.nom).join(', ')}`);
  console.log(`   Thématiques : ${crpOriginal.tabThm?.length || 0} (${crpOriginal.tabThm?.map(t => t.nom).join(', ')})`);
  console.log('   ✅ Structure .crp valide');
});

test('2 — user1 crée entretien3.sonal sur GitLab', async () => {
  const contenuSonal = creerSonalMinimal('entretien3');

  // Vérifier que le fichier n'existe pas encore
  const existeAvant = await api1.verifierExistence(NOUVEL_ENTRETIEN);
  expect(existeAvant, 'entretien3.sonal ne doit pas encore exister').toBe(false);

  // Créer le fichier (POST car nouveau)
  const ecriture = await api1.ecrireFichier(NOUVEL_ENTRETIEN, contenuSonal);
  expect(ecriture.success, 'création du fichier doit réussir').toBe(true);

  // Vérifier que le fichier existe maintenant
  const existeApres = await api1.verifierExistence(NOUVEL_ENTRETIEN);
  expect(existeApres, 'entretien3.sonal doit exister après création').toBe(true);

  console.log(`   ✅ entretien3.sonal créé (${contenuSonal.length} caractères)`);
  console.log(`   Segments : 3, locuteurs : 3`);
});

test('3 — user1 met à jour le .crp pour référencer entretien3', async () => {
  // Construire la nouvelle entrée tabEnt
  const nouvelId = Math.max(...crpOriginal.tabEnt.map(e => e.id)) + 1;
  const nouvelleEntree = creerEntreeTabEnt(
    nouvelId,
    NOUVEL_ENTRETIEN,
    crpOriginal.tabThm,
    crpOriginal.tabVar,
    crpOriginal.tabDic
  );

  // Mettre à jour le .crp
  const crpMisAJour = {
    ...crpOriginal,
    tabEnt: [...crpOriginal.tabEnt, nouvelleEntree],
  };

  const ecriture = await api1.ecrireFichier(CRP_FILE, serializeCrp(crpMisAJour));
  expect(ecriture.success, 'mise à jour .crp doit réussir').toBe(true);

  // Vérifier la persistence
  const relecture = await api1.lireFichier(CRP_FILE);
  expect(relecture.success).toBe(true);
  const crpRelu = parseCrp(relecture.content);
  expect(crpRelu.tabEnt.length, '.crp doit avoir 3 entretiens').toBe(3);
  expect(crpRelu.tabEnt[2].rtrPath, 'le 3e entretien doit pointer vers entretien3.sonal').toBe(NOUVEL_ENTRETIEN);
  expect(crpRelu.tabEnt[2].tabThm, 'les thématiques doivent être copiées').toHaveLength(crpOriginal.tabThm?.length || 0);

  console.log(`   ✅ .crp mis à jour : 3 entretiens (id ${crpRelu.tabEnt.map(e => e.id).join(', ')})`);
  console.log(`   Thématiques copiées : ${crpRelu.tabEnt[2].tabThm.length}`);
});

test('4 — user2 lit le .crp et voit 3 entretiens', async () => {
  const lecture = await api2.lireFichier(CRP_FILE);
  expect(lecture.success).toBe(true);

  const crp = parseCrp(lecture.content);
  expect(crp.tabEnt.length, 'user2 doit voir 3 entretiens').toBe(3);

  const ent3 = crp.tabEnt.find(e => e.rtrPath === NOUVEL_ENTRETIEN);
  expect(ent3, 'user2 doit voir entretien3').toBeTruthy();
  expect(ent3.nom).toBe('entretien3');

  console.log(`   ✅ user2 voit ${crp.tabEnt.length} entretiens`);
  console.log(`   Nouvel entretien : "${ent3.nom}" (id ${ent3.id})`);
});

test('5 — user2 peut lire entretien3.sonal et vérifier sa structure', async () => {
  const lecture = await api2.lireFichier(NOUVEL_ENTRETIEN);
  expect(lecture.success, 'user2 doit pouvoir lire entretien3.sonal').toBe(true);

  const html = lecture.content;
  expect(html).toContain('<!DOCTYPE html>');
  expect(html).toContain('contenuText');
  expect(html).toContain('lblseg');
  expect(html).toContain('loc-json');
  expect(html).toContain('anon-json');

  // Vérifier les segments
  const nbSegs = (html.match(/class="lblseg /g) || []).length;
  expect(nbSegs, 'entretien3 doit avoir des segments').toBeGreaterThan(0);

  // Vérifier les locuteurs
  expect(html).toContain('Enquêteur');
  expect(html).toContain('Enquêté');

  console.log(`   ✅ user2 lit entretien3.sonal : ${html.length} chars, ${nbSegs} segments`);
});

test('6 — user1 verrouille entretien3 et y ajoute un codage thématique', async () => {
  // Lire le fichier
  const lecture = await api1.lireFichier(NOUVEL_ENTRETIEN);
  expect(lecture.success).toBe(true);

  // Verrouiller
  const verrou = await api1.verrouillerFichier(NOUVEL_ENTRETIEN);
  expect(verrou.success).toBe(true);

  // Ajouter cat_002 sur le premier segment (si la thématique existe dans le corpus)
  const aDesThm = crpOriginal.tabThm && crpOriginal.tabThm.length > 1;
  let contenuModifie = lecture.content;

  if (aDesThm) {
    const code = crpOriginal.tabThm[1].code; // ex: cat_002
    contenuModifie = lecture.content.replace(
      /(<span class="lblseg [^"]*")/,
      `<span class="lblseg sautlig ${code}"`
    );
    console.log(`   Ajout du code ${code} sur le premier segment`);
  }

  const ecriture = await api1.ecrireFichier(NOUVEL_ENTRETIEN, contenuModifie);
  expect(ecriture.success, 'écriture avec verrou doit réussir').toBe(true);

  // Vérifier que user2 ne peut pas écrire (n'a pas le verrou)
  const tentative2 = await api2.ecrireFichier(NOUVEL_ENTRETIEN, lecture.content + '<!-- user2 -->');
  expect(tentative2.success, 'user2 sans verrou ne doit pas pouvoir écrire').toBe(false);
  console.log(`   ✅ Verrou fonctionne sur le nouvel entretien`);

  // Libérer
  await api1.deverrouillerFichier(NOUVEL_ENTRETIEN);
  console.log(`   ✅ Verrou libéré`);
});

test('7 — nettoyage : suppression de entretien3 et restauration du .crp', async () => {
  // Supprimer entretien3.sonal
  await api1.deverrouillerFichier(NOUVEL_ENTRETIEN).catch(() => {});
  const suppr = await api1.supprimerFichier(NOUVEL_ENTRETIEN);
  expect(suppr.success, 'suppression entretien3 doit réussir').toBe(true);

  // Restaurer le .crp original
  const ecriture = await api1.ecrireFichier(CRP_FILE, crpOriginalContent);
  expect(ecriture.success, 'restauration .crp doit réussir').toBe(true);

  // Vérifier la restauration
  const relecture = await api1.lireFichier(CRP_FILE);
  expect(relecture.success).toBe(true);
  const crpRelu = parseCrp(relecture.content);
  expect(crpRelu.tabEnt.length, '.crp doit être revenu à 2 entretiens').toBe(2);

  // Vérifier que entretien3.sonal n'existe plus
  const existe = await api1.verifierExistence(NOUVEL_ENTRETIEN);
  expect(existe, 'entretien3.sonal ne doit plus exister').toBe(false);

  console.log(`   ✅ .crp restauré (${crpRelu.tabEnt.length} entretiens)`);
  console.log(`   ✅ entretien3.sonal supprimé`);
});
