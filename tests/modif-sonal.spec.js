/**
 * Test E2E — Modification thématique d'un fichier .sonal réel
 *
 * Scénario :
 *  1. user1 lit entretien1.sonal depuis GitLab (LFS) et vérifie la structure HTML
 *  2. user1 verrouille le fichier
 *  3. user1 modifie le contenu : ajoute le code "cat_002" sur le premier segment
 *  4. user1 sauvegarde et vérifie que la modification est persistée (roundtrip LFS)
 *  5. user2 lit le fichier (sans écrire) et voit la modification
 *  6. user1 ajoute les codes sur plusieurs segments, sauvegarde, vérifie
 *  7. user1 retire tous les codes (simulation "décoder"), vérifie
 *  8. user1 restaure le contenu original et déverrouille
 *
 * Ce test valide :
 *  - Le roundtrip complet LFS avec du contenu HTML réel
 *  - La fidélité du contenu (pas de corruption encodage, pas de troncature)
 *  - La cohérence lecture/écriture entre deux utilisateurs
 *
 * Lancement :
 *   npm run test:modif
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
  if (!val) throw new Error(`Variable d'environnement manquante : ${nom}`);
}

// ── Fonctions utilitaires (simuler ce que fait le renderer SonalPi) ────────────

/**
 * Compte le nombre de segments <span class="lblseg ..."> dans le HTML
 */
function compterSegments(html) {
  return (html.match(/class="lblseg /g) || []).length;
}

/**
 * Ajoute un code thématique (classe CSS) sur le span interne du segment numéro `rksg`
 * Simule le clic sur un segment dans l'UI de SonalPi.
 *
 * Structure cible :
 *   <span class="lblseg sautlig" data-rksg="N">
 *     <span class="" data-rk="...">texte</span>
 *   </span>
 * Après codage :
 *   <span class="lblseg sautlig cat_002" data-rksg="N">
 *     <span class="cat_002" data-rk="...">texte</span>
 *   </span>
 */
function coderSegment(html, rksg, code) {
  // 1. Ajouter le code sur le span externe (lblseg) pour le rksg donné
  // Regex : trouve data-rksg="N" dans le span.lblseg et ajoute la classe
  const regexExterne = new RegExp(
    `(class="lblseg [^"]*?)("\\s[^>]*data-rksg="${rksg}")`,
    'g'
  );
  let modifie = html.replace(regexExterne, (match, cls, reste) => {
    // Ajouter le code s'il n'est pas déjà présent
    if (cls.includes(code)) return match;
    return `${cls} ${code}${reste}`;
  });

  // 2. Ajouter le code sur le span interne (data-sg="N") qui suit immédiatement
  const regexInterne = new RegExp(
    `(data-rksg="${rksg}"[^>]*>\\s*<span class=")([^"]*)(")`,
    'g'
  );
  modifie = modifie.replace(regexInterne, (match, avant, classes, apres) => {
    if (classes.includes(code)) return match;
    const nouvellesClasses = classes.trim() ? `${classes} ${code}` : code;
    return `${avant}${nouvellesClasses}${apres}`;
  });

  return modifie;
}

/**
 * Retire un code thématique de tous les segments
 * Simule le "décoder" dans SonalPi
 */
function decoderTout(html, code) {
  // Retirer le code de toutes les classes (gestion des espaces)
  return html
    .replace(new RegExp(`\\s*${code}\\b`, 'g'), '')
    .replace(new RegExp(`\\b${code}\\s*`, 'g'), '');
}

/**
 * Extrait les classes d'un segment donné pour vérification
 */
function extraireClassesSegment(html, rksg) {
  const regex = new RegExp(`data-rksg="${rksg}"[^>]*>\\s*<span class="([^"]*)"`, 'g');
  const match = regex.exec(html);
  return match ? match[1] : null;
}

// ── État partagé ───────────────────────────────────────────────────────────────

let api1, api2;
let contenuOriginal;

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

  // Nettoyage préventif
  await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});

  // Lecture et sauvegarde du contenu original
  const lecture = await api1.lireFichier(ENTRETIEN1);
  if (!lecture.success) throw new Error(`Impossible de lire ${ENTRETIEN1} : ${lecture.error}`);
  contenuOriginal = lecture.content;

  console.log(`✅ Fichier chargé : ${contenuOriginal.length} caractères`);
  console.log(`   Segments : ${compterSegments(contenuOriginal)}`);
  console.log('');
});

test.afterAll(async () => {
  // Restaurer le contenu original si un test a échoué en cours de route
  if (api1 && contenuOriginal) {
    const lecture = await api1.lireFichier(ENTRETIEN1).catch(() => ({ success: false }));
    if (lecture.success && lecture.content !== contenuOriginal) {
      console.log('\n🔄 Restauration du contenu original (afterAll)...');
      await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
      const verrou = await api1.verrouillerFichier(ENTRETIEN1).catch(() => ({ success: false }));
      if (verrou.success) {
        await api1.ecrireFichier(ENTRETIEN1, contenuOriginal).catch(() => {});
        await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
      }
    }
  }
  if (api1) await api1.deverrouillerFichier(ENTRETIEN1).catch(() => {});
  if (api2) await api2.deverrouillerFichier(ENTRETIEN1).catch(() => {});
});

// ── Tests ──────────────────────────────────────────────────────────────────────

test('1 — le fichier .sonal est un HTML valide avec des segments', async () => {
  expect(contenuOriginal, 'contenu non vide').toBeTruthy();

  // Vérification de la structure HTML Sonal
  expect(contenuOriginal).toContain('<!DOCTYPE html>');
  expect(contenuOriginal).toContain('lblseg');
  expect(contenuOriginal).toContain('data-deb=');
  expect(contenuOriginal).toContain('data-fin=');
  expect(contenuOriginal).toContain('data-rksg=');
  expect(contenuOriginal).toContain('loc-json');
  expect(contenuOriginal).toContain('contenuText');

  const nbSegments = compterSegments(contenuOriginal);
  expect(nbSegments, 'au moins un segment').toBeGreaterThan(0);
  console.log(`   ✅ Structure valide — ${nbSegments} segments`);

  // Vérifier que les codes thématiques ne sont pas déjà présents (état initial propre)
  const hasCat002 = contenuOriginal.includes('cat_002');
  if (hasCat002) {
    console.warn('   ⚠️ Le fichier contient déjà des codes cat_002 — les tests de codage compareront des états relatifs');
  }
});

test('2 — user1 verrouille le fichier', async () => {
  const result = await api1.verrouillerFichier(ENTRETIEN1);
  expect(result.success).toBe(true);
  expect(result.readOnly).toBe(false);
  console.log(`   ✅ Verrou acquis par user1`);
});

test('3 — user1 code le premier segment (cat_002) et sauvegarde', async () => {
  // Coder le segment rksg=0 avec cat_002 (comme dans SonalPi)
  const contenuCode = coderSegment(contenuOriginal, 0, 'cat_002');

  // Vérifier que la modification a bien eu lieu en mémoire
  const classesApres = extraireClassesSegment(contenuCode, 0);
  expect(classesApres, 'le code cat_002 doit être présent dans le span interne').toContain('cat_002');
  console.log(`   Classes du segment 0 après codage : "${classesApres}"`);

  // Sauvegarder sur GitLab
  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuCode);
  expect(ecriture.success, 'écriture doit réussir').toBe(true);
  console.log(`   ✅ Sauvegardé (${contenuCode.length} caractères)`);

  // Relire et vérifier le roundtrip
  const relecture = await api1.lireFichier(ENTRETIEN1);
  expect(relecture.success).toBe(true);
  expect(relecture.content.length, 'taille identique après roundtrip').toBe(contenuCode.length);

  const classesRoundtrip = extraireClassesSegment(relecture.content, 0);
  expect(classesRoundtrip, 'cat_002 doit survivre au roundtrip LFS').toContain('cat_002');
  console.log(`   ✅ Roundtrip LFS OK — classes : "${classesRoundtrip}"`);
});

test('4 — user2 peut lire la version codée (lecture seule)', async () => {
  // user2 n'a pas le verrou, mais peut lire
  const lecture = await api2.lireFichier(ENTRETIEN1);
  expect(lecture.success).toBe(true);

  // user2 voit le codage de user1
  const classesVuesParUser2 = extraireClassesSegment(lecture.content, 0);
  expect(classesVuesParUser2, 'user2 doit voir le code cat_002 posé par user1').toContain('cat_002');
  console.log(`   ✅ user2 voit le codage : "${classesVuesParUser2}"`);

  // Vérification de l'intégrité complète : même nombre de segments
  const nbSeg = compterSegments(lecture.content);
  expect(nbSeg).toBe(compterSegments(contenuOriginal));
  console.log(`   ✅ Intégrité : ${nbSeg} segments (identique à l'original)`);
});

test('5 — user1 code plusieurs segments et vérifie la cohérence', async () => {
  // Lire l'état actuel (déjà cat_002 sur rksg=0)
  const lectureActuelle = await api1.lireFichier(ENTRETIEN1);
  expect(lectureActuelle.success).toBe(true);
  let contenuActuel = lectureActuelle.content;

  const nbSegments = compterSegments(contenuActuel);
  // Coder les segments 1, 2, 3 avec cat_003
  const segmentsACoder = [1, 2, 3].filter(i => i < nbSegments);
  for (const rksg of segmentsACoder) {
    contenuActuel = coderSegment(contenuActuel, rksg, 'cat_003');
  }

  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuActuel);
  expect(ecriture.success).toBe(true);

  // Vérifier roundtrip
  const relecture = await api1.lireFichier(ENTRETIEN1);
  expect(relecture.success).toBe(true);

  for (const rksg of segmentsACoder) {
    const classes = extraireClassesSegment(relecture.content, rksg);
    expect(classes, `segment ${rksg} doit avoir cat_003`).toContain('cat_003');
  }
  // Le segment 0 doit toujours avoir cat_002
  const classesSeg0 = extraireClassesSegment(relecture.content, 0);
  expect(classesSeg0, 'cat_002 sur segment 0 doit être conservé').toContain('cat_002');

  console.log(`   ✅ Multi-codage OK — ${segmentsACoder.length} segments cat_003 + segment 0 cat_002`);
});

test('6 — user1 retire tous les codes (décoder) et vérifie', async () => {
  const lectureActuelle = await api1.lireFichier(ENTRETIEN1);
  expect(lectureActuelle.success).toBe(true);
  let contenuActuel = lectureActuelle.content;

  // Retirer tous les codes
  contenuActuel = decoderTout(contenuActuel, 'cat_002');
  contenuActuel = decoderTout(contenuActuel, 'cat_003');

  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuActuel);
  expect(ecriture.success).toBe(true);

  const relecture = await api1.lireFichier(ENTRETIEN1);
  expect(relecture.success).toBe(true);

  // Vérifier qu'aucun code ne traîne dans le contenu des segments
  const nbSegments = compterSegments(relecture.content);
  for (let i = 0; i < Math.min(nbSegments, 10); i++) {
    const classes = extraireClassesSegment(relecture.content, i);
    if (classes !== null) {
      expect(classes, `segment ${i} ne doit plus avoir de code thématique`).not.toContain('cat_002');
      expect(classes, `segment ${i} ne doit plus avoir de code thématique`).not.toContain('cat_003');
    }
  }
  console.log(`   ✅ Décodage OK — aucun résidu cat_002/cat_003`);
});

test('7 — restauration du contenu original et libération du verrou', async () => {
  const ecriture = await api1.ecrireFichier(ENTRETIEN1, contenuOriginal);
  expect(ecriture.success, 'restauration doit réussir').toBe(true);

  // Vérifier que le contenu est rigoureusement identique à l'original
  const relecture = await api1.lireFichier(ENTRETIEN1);
  expect(relecture.success).toBe(true);
  expect(relecture.content, 'le contenu doit être identique à l\'original').toBe(contenuOriginal);
  console.log(`   ✅ Contenu original restauré (${contenuOriginal.length} caractères)`);

  // Libérer le verrou
  const deverrou = await api1.deverrouillerFichier(ENTRETIEN1);
  expect(deverrou.success).toBe(true);
  console.log(`   ✅ Verrou libéré`);

  // Vérifier que user2 peut maintenant verrouiller
  const verrou2 = await api2.verrouillerFichier(ENTRETIEN1);
  expect(verrou2.success, 'user2 doit pouvoir verrouiller après libération').toBe(true);
  await api2.deverrouillerFichier(ENTRETIEN1);
  console.log(`   ✅ user2 peut verrouiller — fichier libre`);
});
