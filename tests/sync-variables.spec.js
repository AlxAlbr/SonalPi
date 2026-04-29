/**
 * Test E2E — Synchronisation des variables entre utilisateurs (GitLab)
 *
 * Contexte :
 *  Ce test reproduit le bug signalé : après qu'User A a renseigné une variable
 *  (ex. sexe = Homme) via la base de données, User B ouvre le corpus et voit
 *  la valeur correcte dans le tableau (affichDataGen) MAIS vide dans le panneau
 *  gauche (affichDataEnt → getMod).
 *
 *  La cause identifiée :
 *   1. `sauvegarderCorpus()` met à jour le .crp avec tabEnt[0].tabDat = [{v:1, l:"all", m:1}]
 *   2. `majFichierSonal()` est fire-and-forget → peut échouer sans bloquer le .crp
 *   3. Le .sonal reste donc avec tabDat = [] (état avant création de la variable)
 *   4. `loadHtml()` lit le .sonal → `extractFichierSonal` retourne tabDat = []
 *   5. La garde `if (donnéesEnt.tabDat)` passe ([] est truthy en JS !)
 *   6. tabEnt[0].tabDat est écrasé par [] → getMod ne trouve plus rien
 *
 *  Le test vérifie le comportement en trois scénarios :
 *   A) Cas normal : .sonal à jour → les deux vues voient la valeur
 *   B) Bug scenario : .sonal a tabDat = [], .crp a la valeur
 *      → avec la logique buggy, getMod renvoie vide
 *   C) Fix scenario : même état que B mais avec la logique corrigée
 *      → getMod retrouve la valeur depuis le .crp
 *
 * Lancement :
 *   npm run test:sync-variables
 */

require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { obtenirToken } = require('./helpers/oauth');
const GitLabAPI = require('../modules/gitlab_api');

const {
  GITLAB_INSTANCE: INSTANCE = 'https://127.0.0.1.nip.io',
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

// ── Constantes du corpus de test ──────────────────────────────────────────────

const VAR_SEXE = { v: 1, lib: 'sexe', champ: 'gen', priv: 'non' };
const DIC_SEXE = [
  { v: 1, m: 0, lib: '' },
  { v: 1, m: 1, lib: 'Homme' },
  { v: 1, m: 2, lib: 'Femme' },
];
// Entrée tabDat pour entretien1 = Homme
const DAT_HOMME = { e: '1', v: 1, l: 'all', m: 1 };

// ── Helpers : simulation de la logique renderer (sans DOMParser) ──────────────

/**
 * Extrait le contenu du bloc `dat-json` d'un fichier .sonal
 * Reproduit la logique de extractFichierSonal() → extractJSON('dat-json')
 * @param {string} htmlString
 * @returns {Array|null}
 */
function extractDatJson(htmlString) {
  const match = htmlString.match(/<script[^>]*id=["']dat-json["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) return null;
  try {
    let content = match[1]
      .replace(/\s+/g, ' ')
      .replace(/,\s*,+/g, ',')
      .replace(/^\s*,+\s*/, '')
      .replace(/\s*,+\s*$/, '')
      .replace(/{\s*,+\s*/, '{')
      .replace(/,+\s*}/g, '}')
      .replace(/\[\s*,+\s*/, '[')
      .replace(/,+\s*\]/g, ']')
      .trim();

    // Supprimer les accolades terminales en excès
    const countOpen  = s => (s.match(/{/g) || []).length;
    const countClose = s => (s.match(/}/g) || []).length;
    while (countClose(content) > countOpen(content)) {
      content = content.replace(/}\s*$/, '');
    }

    // Retirer les accolades externes si elles encadrent un tableau/objet
    if (content.startsWith('{') && content.endsWith('}')) {
      const inner = content.slice(1, -1).trim();
      if (inner.startsWith('[') || inner.startsWith('{')) {
        content = inner;
      }
    }

    if (!content || content.length < 2 || content === '{ undefined }') return null;
    return JSON.parse(content);
  } catch (err) {
    console.error('extractDatJson : erreur parsing :', err.message);
    return null;
  }
}

/**
 * Simule la logique BUGGY de loadHtml() pour tabDat :
 *   `if (donnéesEnt.tabDat)  tabEnt[e].tabDat = donnéesEnt.tabDat;`
 *
 * Le bug : [] est truthy en JS, donc un .sonal avec tabDat = []
 * écrase le tabDat correct issu du .crp.
 *
 * @param {Array} tabDatCrp   tabDat depuis le .crp (source de vérité)
 * @param {Array|null} tabDatSonal  tabDat extrait du .sonal
 * @returns {Array}  tabDat résultant après le loadHtml
 */
function simulerLoadHtml_buggy(tabDatCrp, tabDatSonal) {
  // Reproduit : if (donnéesEnt.tabDat)  tabEnt[e].tabDat = donnéesEnt.tabDat;
  if (tabDatSonal) return tabDatSonal;
  return tabDatCrp;
}

/**
 * Simule la logique CORRIGÉE de loadHtml() pour tabDat :
 *   `if (donnéesEnt.tabDat && donnéesEnt.tabDat.length > 0)  tabEnt[e].tabDat = donnéesEnt.tabDat;`
 *
 * Le fix : on n'écrase le .crp que si le .sonal a des données réelles.
 * Un tableau vide [] issu d'un .sonal stale ne remplace pas les données du .crp.
 *
 * @param {Array} tabDatCrp
 * @param {Array|null} tabDatSonal
 * @returns {Array}
 */
function simulerLoadHtml_fixed(tabDatCrp, tabDatSonal) {
  if (tabDatSonal && tabDatSonal.length > 0) return tabDatSonal;
  return tabDatCrp;
}

/**
 * Simule getMod(rkEnt, v, "all", tabDat, tabDic)
 * Reproduit la logique de getMod() dans gestion_data.js
 *
 * @param {Array}  tabDatEnt  tabEnt[rkEnt].tabDat
 * @param {number} v          code de la variable
 * @param {string} l          locuteur ("all" pour variables générales)
 * @param {Array}  tabDic     dictionnaire global
 * @returns {{ moda: number, libellé: string }}
 */
function simulerGetMod(tabDatEnt, v, l, tabDic) {
  const ligDat = (tabDatEnt || []).filter(d => d.v == v && d.l == l);
  if (ligDat.length === 0) return { moda: 0, libellé: '' };

  const moda = ligDat[0].m;
  if (moda <= 0) return { moda: 0, libellé: '' };

  const ligDic = tabDic.find(item => item.v == v && item.m == moda);
  return { moda, libellé: ligDic ? ligDic.lib : '' };
}

/**
 * Génère le contenu d'un fichier .sonal minimal avec les blocs JSON fournis.
 * Reproduit le format généré par sauvHtml() dans gestion_fichiers.js.
 *
 * @param {Array}  tabLoc
 * @param {Array}  tabVar
 * @param {Array}  tabDic
 * @param {Array}  tabDat
 * @returns {string}
 */
function genererSonal(tabLoc = [], tabVar = [], tabDic = [], tabDat = []) {
  const locJSON  = JSON.stringify(tabLoc);
  const varJSON  = JSON.stringify(tabVar);
  const dicJSON  = JSON.stringify(tabDic);
  const datJSON  = JSON.stringify(tabDat);
  const anonJSON = JSON.stringify([]);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Entretien SonalPi</title>
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
            ${varJSON}
        }
</script>
<script id="dic-json" type="application/json">
        {
            ${dicJSON}
        }
</script>
<script id="dat-json" type="application/json">
        {
            ${datJSON}
        }
</script>
<script id="anon-json" type="application/json">
        {
            ${anonJSON}
        }
</script>
<div style="margin:40px;">
  <H2>Notes</H2>
  <div id="txtnotes"></div>
</div>
<div id="contenuText">
<span class="lblseg sautlig ligloc" data-deb="0.0" data-fin="3.0" data-loc="1" tabindex="1" data-rksg="0" data-nomloc="Enquêteur"><span class="" data-rk="1" data-sg="0" data-len="5">Bonjour.</span></span>
</div>
</body>
</html>`;
}

/**
 * Génère le contenu d'un .crp minimal avec la variable sexe et la valeur Homme
 * pour entretien1.
 *
 * @param {Object} baseEnt  entrée tabEnt existante (id, nom, rtrPath, tabLoc…)
 * @param {boolean} avecDat  inclure le tabDat dans tabEnt[0] (true = état après validMod)
 * @returns {string}
 */
function genererCrp(baseEnt, avecDat = true) {
  const tabVar = [VAR_SEXE];
  const tabDic = DIC_SEXE;
  const tabDat = avecDat ? [DAT_HOMME] : [];

  const entretien = {
    ...baseEnt,
    tabVar,
    tabDic,
    tabDat,
  };

  return JSON.stringify({
    tabThm: [],
    tabEnt: [entretien],
    tabVar,
    tabDic,
  });
}

// ── État partagé ───────────────────────────────────────────────────────────────

let api1, api2;
let crpOriginalContent;
let sonalOriginalContent;
let entBase; // entrée tabEnt de référence (lue depuis le .crp initial)

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

  // Lire et mémoriser les contenus originaux pour restauration
  const [lectCrp, lectSonal] = await Promise.all([
    api1.lireFichier(CRP_FILE),
    api1.lireFichier(ENTRETIEN1),
  ]);

  if (!lectCrp.success)   throw new Error(`Impossible de lire ${CRP_FILE} : ${lectCrp.error}`);
  if (!lectSonal.success) throw new Error(`Impossible de lire ${ENTRETIEN1} : ${lectSonal.error}`);

  crpOriginalContent   = lectCrp.content;
  sonalOriginalContent = lectSonal.content;

  // Extraire l'entrée tabEnt[0] de base (id, nom, rtrPath, tabLoc, etc.)
  const crpParse = JSON.parse(crpOriginalContent);
  entBase = crpParse.tabEnt[0];
  if (!entBase) throw new Error('Le .crp initial ne contient aucun entretien');

  console.log(`✅ Corpus chargé : entretien "${entBase.nom}" (id=${entBase.id})\n`);
});

test.afterAll(async () => {
  if (!api1) return;
  console.log('\n🧹 Restauration des fichiers originaux...');
  await Promise.all([
    api1.ecrireFichier(CRP_FILE,   crpOriginalContent),
    api1.ecrireFichier(ENTRETIEN1, sonalOriginalContent),
  ]);
  console.log('   ✅ .crp et .sonal restaurés');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO A — Cas normal (UserA met à jour les DEUX fichiers correctement)
// ═══════════════════════════════════════════════════════════════════════════════

test('A — .sonal et .crp à jour : getMod retourne "Homme" dans les deux simulations', async () => {
  // UserA : mettre à jour .crp (tabDat inclus) ET .sonal (tabDat inclus)
  const crpContent   = genererCrp(entBase, true);   // tabDat = [{v:1,l:"all",m:1}]
  const sonalContent = genererSonal(
    entBase.tabLoc || ['', 'Enquêteur', 'Enquêté'],
    [VAR_SEXE],
    DIC_SEXE,
    [DAT_HOMME],  // .sonal à jour avec la valeur
  );

  await Promise.all([
    api1.ecrireFichier(CRP_FILE,   crpContent),
    api1.ecrireFichier(ENTRETIEN1, sonalContent),
  ]);
  // Attendre que GitLab commite
  await new Promise(r => setTimeout(r, 2000));

  // UserB : lit les deux fichiers
  const [lectCrp2, lectSonal2] = await Promise.all([
    api2.lireFichier(CRP_FILE),
    api2.lireFichier(ENTRETIEN1),
  ]);
  expect(lectCrp2.success,   '.crp lisible par user2').toBe(true);
  expect(lectSonal2.success, '.sonal lisible par user2').toBe(true);

  const crp2       = JSON.parse(lectCrp2.content);
  const tabDatCrp  = crp2.tabEnt[0].tabDat;
  const tabDatSonal = extractDatJson(lectSonal2.content);
  const tabDic     = crp2.tabDic;

  console.log('   tabDatCrp  :', JSON.stringify(tabDatCrp));
  console.log('   tabDatSonal:', JSON.stringify(tabDatSonal));

  // Simulation buggy — .sonal a la valeur, donc même la version buggy fonctionne
  const tabDatResultat_buggy = simulerLoadHtml_buggy(tabDatCrp, tabDatSonal);
  const { libellé: lib_buggy } = simulerGetMod(tabDatResultat_buggy, 1, 'all', tabDic);
  expect(lib_buggy, '[cas normal / buggy] getMod doit retourner "Homme"').toBe('Homme');

  // Simulation fixée — même résultat attendu
  const tabDatResultat_fixed = simulerLoadHtml_fixed(tabDatCrp, tabDatSonal);
  const { libellé: lib_fixed } = simulerGetMod(tabDatResultat_fixed, 1, 'all', tabDic);
  expect(lib_fixed, '[cas normal / fixed] getMod doit retourner "Homme"').toBe('Homme');

  console.log('   ✅ Scénario A OK : les deux logiques retournent "Homme"');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO B — Bug : .sonal stale (tabDat = []), .crp à jour
// ═══════════════════════════════════════════════════════════════════════════════

test('B — .sonal stale (tabDat=[]) + .crp à jour : la logique BUGGY perd la valeur', async () => {
  // UserA : met à jour le .crp MAIS le .sonal reste avec tabDat = []
  // (simule majFichierSonal() qui a échoué silencieusement, ou .sonal créé avant la variable)
  const crpContent   = genererCrp(entBase, true);   // tabDat = [{v:1,l:"all",m:1}]
  const sonalStale   = genererSonal(
    entBase.tabLoc || ['', 'Enquêteur', 'Enquêté'],
    [],   // pas de variables dans le .sonal (état avant création de la variable)
    [],
    [],   // tabDat = [] ← c'est la cause du bug
  );

  await Promise.all([
    api1.ecrireFichier(CRP_FILE,   crpContent),
    api1.ecrireFichier(ENTRETIEN1, sonalStale),
  ]);
  await new Promise(r => setTimeout(r, 2000));

  // UserB : lit les deux fichiers
  const [lectCrp2, lectSonal2] = await Promise.all([
    api2.lireFichier(CRP_FILE),
    api2.lireFichier(ENTRETIEN1),
  ]);
  expect(lectCrp2.success,   '.crp lisible par user2').toBe(true);
  expect(lectSonal2.success, '.sonal lisible par user2').toBe(true);

  const crp2       = JSON.parse(lectCrp2.content);
  const tabDatCrp  = crp2.tabEnt[0].tabDat;
  const tabDatSonal = extractDatJson(lectSonal2.content);
  const tabDic     = crp2.tabDic;

  console.log('   tabDatCrp  :', JSON.stringify(tabDatCrp));
  console.log('   tabDatSonal:', JSON.stringify(tabDatSonal));

  // Vérification préalable : le .crp a bien la valeur
  expect(tabDatCrp).not.toBeNull();
  expect(tabDatCrp.length, '.crp doit avoir 1 entrée tabDat').toBe(1);
  expect(tabDatCrp[0].m, 'tabDatCrp.m doit être 1 (Homme)').toBe(1);

  // Vérification préalable : le .sonal a bien tabDat = []
  expect(Array.isArray(tabDatSonal), 'extractDatJson doit retourner un tableau').toBe(true);
  expect(tabDatSonal.length, '.sonal doit avoir tabDat = []').toBe(0);

  // ── Simulation BUGGY ──────────────────────────────────────────────────────
  // [] est truthy → écrase le tabDatCrp → getMod retourne vide → BUG
  const tabDatResultat_buggy = simulerLoadHtml_buggy(tabDatCrp, tabDatSonal);
  console.log('   tabDatResultat [buggy]:', JSON.stringify(tabDatResultat_buggy));

  const { libellé: lib_buggy } = simulerGetMod(tabDatResultat_buggy, 1, 'all', tabDic);
  console.log('   getMod [buggy]:', JSON.stringify({ lib: lib_buggy }));

  // C'est le comportement buggy attendu : la valeur est perdue
  expect(lib_buggy, '[buggy] getMod doit retourner "" (le bug)').toBe('');

  console.log('   ✅ Bug B reproduit : logique buggy écrase tabDat avec [] et getMod retourne vide');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO C — Fix : même état que B, mais avec la logique corrigée
// ═══════════════════════════════════════════════════════════════════════════════

test('C — .sonal stale (tabDat=[]) + .crp à jour : la logique CORRIGÉE préserve la valeur', async () => {
  // Même état que le scénario B (pas besoin de ré-écrire, on réutilise ce qui est sur GitLab)
  // On relit simplement les fichiers tels qu'ils sont depuis le test B
  const [lectCrp2, lectSonal2] = await Promise.all([
    api2.lireFichier(CRP_FILE),
    api2.lireFichier(ENTRETIEN1),
  ]);
  expect(lectCrp2.success,   '.crp lisible par user2').toBe(true);
  expect(lectSonal2.success, '.sonal lisible par user2').toBe(true);

  const crp2       = JSON.parse(lectCrp2.content);
  const tabDatCrp  = crp2.tabEnt[0].tabDat;
  const tabDatSonal = extractDatJson(lectSonal2.content);
  const tabDic     = crp2.tabDic;

  // ── Simulation CORRIGÉE ───────────────────────────────────────────────────
  // tabDatSonal.length == 0 → on conserve tabDatCrp → getMod retourne "Homme"
  const tabDatResultat_fixed = simulerLoadHtml_fixed(tabDatCrp, tabDatSonal);
  console.log('   tabDatResultat [fixed]:', JSON.stringify(tabDatResultat_fixed));

  const { libellé: lib_fixed, moda: moda_fixed } = simulerGetMod(tabDatResultat_fixed, 1, 'all', tabDic);
  console.log('   getMod [fixed]:', JSON.stringify({ lib: lib_fixed, moda: moda_fixed }));

  expect(lib_fixed, '[fixed] getMod doit retourner "Homme"').toBe('Homme');
  expect(moda_fixed, '[fixed] moda doit être 1').toBe(1);

  console.log('   ✅ Fix C validé : logique corrigée préserve tabDat du .crp et getMod retourne "Homme"');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO D — Cohérence entre vue base (affichDataGen) et panneau gauche (getMod)
// Vérifie que les deux vues accèdent à la même source de données après le fix
// ═══════════════════════════════════════════════════════════════════════════════

test('D — après fix : vue base (tabDat global) et panneau gauche (tabEnt[e].tabDat) cohérents', async () => {
  // Mettre en place l'état avec .sonal stale et .crp à jour
  const crpContent = genererCrp(entBase, true);
  const sonalStale = genererSonal(
    entBase.tabLoc || ['', 'Enquêteur', 'Enquêté'],
    [], [], [],
  );
  await Promise.all([
    api1.ecrireFichier(CRP_FILE,   crpContent),
    api1.ecrireFichier(ENTRETIEN1, sonalStale),
  ]);
  await new Promise(r => setTimeout(r, 2000));

  // UserB lit les fichiers
  const [lectCrp2, lectSonal2] = await Promise.all([
    api2.lireFichier(CRP_FILE),
    api2.lireFichier(ENTRETIEN1),
  ]);

  const crp2        = JSON.parse(lectCrp2.content);
  const tabDatCrp   = crp2.tabEnt[0].tabDat;   // depuis le .crp
  const tabDatSonal = extractDatJson(lectSonal2.content);  // depuis le .sonal
  const tabDic      = crp2.tabDic;
  const idEnt       = String(crp2.tabEnt[0].id);

  // ── Simulation de affichDataGen (vue base) ────────────────────────────────
  // inventaireVariables() reconstruit tabDat depuis tabEnt[e].tabDat APRÈS cleanVariables()
  // Dans notre simulation : tabDat global = tabDatCrp (avant écrasement par loadHtml)
  // Après le fix, tabEnt[0].tabDat = tabDatCrp (pas écrasé par le .sonal stale)
  const tabDatApresLoadHtml = simulerLoadHtml_fixed(tabDatCrp, tabDatSonal);

  // tabDat global reconstruit par inventaireVariables (entrées avec e = idEnt)
  const tabDatGlobal = tabDatApresLoadHtml.filter(d => String(d.e) === idEnt || d.e == null);

  // Vue base : filtre par idEnt et variable (pas de filtre l)
  const ligDatBase = tabDatGlobal.filter(d => String(d.e) === idEnt && d.v == VAR_SEXE.v);
  const libBase = ligDatBase.length > 0
    ? (tabDic.find(dc => dc.v == VAR_SEXE.v && dc.m == ligDatBase[0].m)?.lib ?? '')
    : '';

  // ── Simulation de getMod (panneau gauche) ─────────────────────────────────
  const { libellé: libPanneauG } = simulerGetMod(tabDatApresLoadHtml, VAR_SEXE.v, 'all', tabDic);

  console.log('   Vue base (affichDataGen) :', libBase);
  console.log('   Panneau gauche (getMod)  :', libPanneauG);

  expect(libBase,      'Vue base doit afficher "Homme"').toBe('Homme');
  expect(libPanneauG,  'Panneau gauche doit afficher "Homme"').toBe('Homme');
  expect(libBase).toBe(libPanneauG);

  console.log('   ✅ Scénario D OK : cohérence entre vue base et panneau gauche');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIO E — Vérification que le .crp est bien mis à jour par user1
// (simule validMod + sauvegarderCorpus côté user1)
// ═══════════════════════════════════════════════════════════════════════════════

test('E — user1 sauvegarde la valeur, user2 lit le .crp et voit la valeur dans tabDat', async () => {
  // Restaurer un état vierge (pas de variable)
  const crpSansVar = JSON.stringify({
    tabThm: [],
    tabEnt: [{ ...entBase, tabVar: [], tabDic: [], tabDat: [] }],
    tabVar: [],
    tabDic: [],
  });
  const sonalVierge = genererSonal(entBase.tabLoc || ['', 'Enquêteur', 'Enquêté'], [], [], []);

  await Promise.all([
    api1.ecrireFichier(CRP_FILE,   crpSansVar),
    api1.ecrireFichier(ENTRETIEN1, sonalVierge),
  ]);
  await new Promise(r => setTimeout(r, 2000));

  // User2 lit et vérifie qu'il n'y a pas encore de variable
  const lectAvant = await api2.lireFichier(CRP_FILE);
  const crpAvant  = JSON.parse(lectAvant.content);
  expect(crpAvant.tabVar.length, 'Avant : tabVar doit être vide').toBe(0);
  expect((crpAvant.tabEnt[0].tabDat || []).length, 'Avant : tabDat doit être vide').toBe(0);
  console.log('   Avant : aucune variable renseignée ✓');

  // User1 simule validMod() + sauvegarderCorpus() :
  //   → met à jour le .crp avec la variable sexe = Homme
  const crpApresValidMod = genererCrp(entBase, true);
  await api1.ecrireFichier(CRP_FILE, crpApresValidMod);
  await new Promise(r => setTimeout(r, 2000));

  // User2 lit le .crp mis à jour
  const lectApres = await api2.lireFichier(CRP_FILE);
  expect(lectApres.success, '.crp lisible après mise à jour').toBe(true);
  const crpApres = JSON.parse(lectApres.content);

  // Vérifications
  expect(crpApres.tabVar.length,            'Après : tabVar doit contenir 1 variable').toBe(1);
  expect(crpApres.tabVar[0].lib,            'La variable doit s\'appeler "sexe"').toBe('sexe');
  expect(crpApres.tabDic.some(d => d.lib === 'Homme'), 'tabDic doit contenir "Homme"').toBe(true);

  const tabDat = crpApres.tabEnt[0].tabDat;
  expect(tabDat,           'tabEnt[0].tabDat ne doit pas être null').not.toBeNull();
  expect(tabDat.length,    'tabEnt[0].tabDat doit contenir 1 entrée').toBe(1);
  expect(tabDat[0].l,      'l doit être "all" (variable générale)').toBe('all');
  expect(tabDat[0].m,      'm doit être 1 (Homme)').toBe(1);

  // Simulation de getMod avec la logique corrigée (tabDat du .crp préservé)
  const { libellé } = simulerGetMod(tabDat, VAR_SEXE.v, 'all', crpApres.tabDic);
  expect(libellé, 'getMod doit retourner "Homme"').toBe('Homme');

  console.log('   ✅ Scénario E OK : user2 voit bien "Homme" depuis le .crp mis à jour par user1');
});
