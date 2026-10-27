import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus } from './util'
import { FORMAT_VERSION } from '../src/shared/format'

/**
 *  Migration SonalPi1 → SonalPi2 : le flux COMPLET.
 *  Un `.crp` V1 (choisi via dialogue natif) → APERÇU → dossier DÉDIÉ avec
 *  gardes (on n'écrase jamais : corpus.json refusé, démo refusé, dossier non
 *  vide sans corpus.json = avertissement à confirmer) → exécution :
 *  corpus V2 écrit (nom + meta.sourceV1 + codebook/variables), ouvert, ajouté
 *  aux récents. Le contenu des entretiens (.Sonal) est hors de ce spec. Les dialogues natifs sont stubbés (electronApp.evaluate) : le choix du
 *  `.crp` (filtre crp) renvoie le chemin du fixture, le choix du dossier
 *  (openDirectory, sans filtre) le dossier cible de l'appel.
 *
 *  Fixture : test/fixtures/corpusV1.crp (corpus V1 réel sauvé, sans
 *  nom/dateCreation — 3 entretiens, 6 thèmes, 3 variables, 3 règles anon).
 */

/** Stub des DIALOGS de la modale de migration : `.crp` (filtre crp) → chemin
 *  du fixture ; dossier dédié (sans filtre) → `dossier` de l'invocation.
 *  Re-stubbable pour changer le dossier entre deux sessions (raison par test). */
async function stuberDialogs(
  app: import('@playwright/test').ElectronApplication,
  crp: string,
  dossier: string,
): Promise<void> {
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async (...a: unknown[]) => {
      // Dans notre main, showOpenDialog reçoit TOUJOURS les options en 1er
      // (jamais la forme (window, options)) ; on reste tolérant aux deux.
      const opts = (a.length > 1 ? a[a.length - 1] : a[0]) as {
        filters?: { extensions: string[] }[]
      }
      const estCrp = (opts?.filters ?? []).some((f) => f.extensions?.includes('crp'))
      return { canceled: false, filePaths: [estCrp ? args.crp : args.dossier] }
    }
  }, { crp, dossier })
}

/** Fixture `.crp` copié dans le profil du test (isolé par --user-data-dir). */
function ecrireCrp(profil: string, nom: string, source: string): string {
  const chemin = join(profil, nom)
  writeFileSync(chemin, readFileSync(join(process.cwd(), 'test/fixtures', source), 'utf8'))
  return chemin
}

/** WAV PCM 16 bits mono 8 kHz (décodable par Chromium) — 1 s. */
function ecrireWav(chemin: string): void {
  const freqEch = 8000
  const n = freqEch
  const buf = Buffer.alloc(44 + n * 2)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + n * 2, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(freqEch, 24)
  buf.writeUInt32LE(freqEch * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(12000 * Math.sin(2 * Math.PI * 440 * (i / freqEch))), 44 + i * 2)
  }
  writeFileSync(chemin, buf)
}

/** Un dossier V1 RÉALISTE : `MonCorpus.crp` (thèmes + 3 entretiens) à côté de
 *  ses `.sonal` et de l'audio référencé (absolu). Le 2e entretien pointe un
 *  `.sonal` ABSENT (Q1b) ; le 1er n'a pas d'audio ; le 3e a les deux. */
function ecrireCorpusV1(profil: string): { cheminCrp: string; audioPath: string } {
  const dirV1 = join(profil, 'V1')
  mkdirSync(dirV1, { recursive: true })
  const audioPath = join(profil, 'audio-E1.wav')
  ecrireWav(audioPath)
  // .sonal réels du dépôt (fixtures de démo) : entretien1 (Karine, 8 cat-json
  // > 6 du .crp → Q7) et entretien2.
  writeFileSync(join(dirV1, 'entretien1.sonal'), readFileSync(join(process.cwd(), 'test/fixtures/entretien1.sonal')))
  writeFileSync(join(dirV1, 'entretien3.sonal'), readFileSync(join(process.cwd(), 'test/fixtures/entretien2.sonal')))

  const crp = JSON.parse(readFileSync(join(process.cwd(), 'test/fixtures/corpusV1.crp'), 'utf8')) as {
    tabThm: Array<Record<string, unknown>>
    tabEnt: Array<Record<string, unknown>>
  }
  // L'utilisateur a SUPPRIMÉ « ★☆☆ Important » (cat_004) en V1 : le .crp ne le
  // porte plus → SonalPi2 ne doit pas le recréer (le bloc Pondérations par défaut
  // n'est écrit que pour un corpus SonalPi2 NEUF, jamais en migration).
  crp.tabThm = crp.tabThm.filter((t) => t.code !== 'cat_004')
  // Raccourcit à 3 entretiens ciblant les fichiers présents / absent (Q1b).
  crp.tabEnt = [
    { id: 1, nom: 'entretien1', rtrPath: 'entretien1.sonal', audioPath: '', tabLoc: ['', 'Enquêteur', 'Émilie'] },
    { id: 2, nom: 'sans-sonal', rtrPath: 'introuvable.sonal', audioPath, tabLoc: ['', 'Speaker 1'] },
    { id: 3, nom: 'entretien3', rtrPath: 'entretien3.sonal', audioPath, tabLoc: ['', 'Speaker 1', 'Speaker 2'] },
  ]
  const cheminCrp = join(dirV1, 'MonCorpus.crp')
  writeFileSync(cheminCrp, JSON.stringify(crp, null, 2))
  return { cheminCrp, audioPath }
}

function lireCorpus(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, 'corpus.json'), 'utf8'))
}

/** Lit un entretien du corpus migré (sous dossier SonalPi2). */
function lireEntretien(dirCorpus: string, id: string): Record<string, any> {
  return JSON.parse(readFileSync(join(dirCorpus, 'entretiens', `${id}.json`), 'utf8'))
}

test('la modale de migration GitLab est centrée sur un voile couvrant la fenêtre', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-migration-gitlab-modale-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.locator('.migrer-gitlab').click()
    const dialogue = page.getByRole('dialog', { name: 'Migration SonalPi1 — GitLab' })
    await expect(dialogue).toBeVisible()
    for (const taille of [{ width: 1000, height: 800 }, { width: 640, height: 480 }]) {
      await page.setViewportSize(taille)
      const disposition = await dialogue.evaluate((element) => {
        const voile = element.parentElement!
        const style = getComputedStyle(voile)
        const fond = voile.getBoundingClientRect()
        const cadre = element.getBoundingClientRect()
        return {
          position: style.position, display: style.display, alignement: style.alignItems, justification: style.justifyContent,
          x: fond.x, y: fond.y, largeur: fond.width, hauteur: fond.height,
          centreX: cadre.x + cadre.width / 2, centreY: cadre.y + cadre.height / 2,
          fenetreLargeur: document.documentElement.clientWidth, fenetreHauteur: document.documentElement.clientHeight,
        }
      })
      expect(disposition).toMatchObject({ position: 'fixed', display: 'flex', alignement: 'center', justification: 'center', x: 0, y: 0 })
      expect(disposition.largeur).toBe(disposition.fenetreLargeur)
      expect(disposition.hauteur).toBe(disposition.fenetreHauteur)
      expect(disposition.centreX).toBeCloseTo(disposition.fenetreLargeur / 2, 0)
      expect(disposition.centreY).toBeCloseTo(disposition.fenetreHauteur / 2, 0)
    }
    await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(profil, { recursive: true, force: true })
  }
})

for (const mode of ['oauth', 'jeton-personnel'] as const) {
  test(`la migration réutilise un projet enregistré sans demander ses accès (${mode}, API simulée)`, async () => {
    const profil = mkdtempSync(join(tmpdir(), 'sonal-migration-connexion-'))
    const app = await lancer(profil)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await app.evaluate(({ ipcMain }, authentification) => {
        const urlInstance = 'https://gitlab.example.org'
        const compte = { id: 'compte', urlInstance, utilisateur: 'moi', authentification,
          connecte: true, aRafraichir: false, scopes: ['api'] }
        const projet = { compteId: compte.id, urlInstance, utilisateur: compte.utilisateur,
          projetId: 777, nomProjet: 'Terrain enregistré', branche: 'terrain' }
        for (const canal of ['gitlab:lister', 'gitlab:etat', 'gitlab:detecterInstance', 'gitlab:connecter',
          'gitlab:connecterAvecJeton', 'migrer:gitlab:decouvrir']) ipcMain.removeHandler(canal)
        ipcMain.handle('gitlab:lister', () => [{ fournisseur: 'gitlab', id: 'connue', ...projet,
          authentification, racine: '', connexionDisponible: true, baseMedia: null }])
        ipcMain.handle('gitlab:etat', () => ({ urlInstance, comptes: [compte], applicationConnue: true,
          uriCallback: 'http://127.0.0.1:7474/callback' }))
        for (const canal of ['gitlab:detecterInstance', 'gitlab:connecter', 'gitlab:connecterAvecJeton']) {
          ipcMain.handle(canal, () => { throw new Error('La source connue ne doit pas redemander une connexion.') })
        }
        ipcMain.handle('migrer:gitlab:decouvrir', (_e, demande) => {
          if (demande.destinationId !== 'connue') throw new Error('La source enregistrée doit être choisie par son identifiant.')
          return { preparationId: 'preparation-simulee', projet, commit: 'a'.repeat(40), corpus: ['terrain.crp'] }
        })
      }, mode)
      await page.locator('.migrer-gitlab').click()
      const dialogue = page.getByRole('dialog', { name: 'Migration SonalPi1 — GitLab' })
      await dialogue.getByRole('combobox', { name: /^Projet source/ }).selectOption('connue')
      await expect(dialogue.getByText('Connecté : moi', { exact: true })).toBeVisible()
      await expect(dialogue.getByLabel('Adresse du projet source', { exact: true })).toHaveCount(0)
      await expect(dialogue.getByLabel('Client ID OAuth', { exact: true })).toHaveCount(0)
      await expect(dialogue.getByLabel('Jeton d’accès GitLab (scope api)', { exact: true })).toHaveCount(0)
      await dialogue.getByRole('button', { name: 'Lire la source', exact: true }).click()
      await expect(dialogue.getByText('Corpus : terrain.crp', { exact: true })).toBeVisible()
      await expect(dialogue.getByLabel('Adresse du nouveau projet GitLab', { exact: true })).toBeVisible()
      await dialogue.getByRole('combobox', { name: /^Projet source/ }).selectOption('')
      await expect(dialogue.getByLabel('Adresse du projet source', { exact: true })).toBeVisible()
      await expect(dialogue.getByLabel('Client ID OAuth', { exact: true })).toBeVisible()
      await expect(dialogue.getByText('Corpus : terrain.crp', { exact: true })).toHaveCount(0)
      await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    } finally {
      await app.close()
      rmSync(profil, { recursive: true, force: true })
    }
  })
}

test('flux complet — .crp → aperçu → dossier dédié → corpus SonalPi2 ouvert, entretiens .Sonal+audio migrés', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1migr-'))
  const { cheminCrp, audioPath } = ecrireCorpusV1(profil)
  const dirCible = join(profil, 'MonCorpus') // dossier dédié, VIDE
  writeFileSync(cheminCrp.replace(/\.crp$/, '.out'), 'le\nla')
  writeFileSync(cheminCrp.replace(/\.crp$/, '.lem'), 'allais\taller\tV')

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await stuberDialogs(app, cheminCrp, dirCible)

  // Carte « Migrer un corpus SonalPi1… » → modale.
  await page.locator('.carte-demo.migrer-corpus').click()
  await expect(page.locator('.modale-migration')).toBeVisible()

  // Étape 1 — .crp → APERÇU : identité + compteurs, avant toute écriture.
  await page.locator('.modale-migration .choisir-crp').click()
  await expect(page.locator('.modale-migration .apercu-nom')).toHaveText('MonCorpus') // repli nom de fichier
  await expect(page.locator('.modale-migration .apercu-date')).toContainText('3 entretien')
  await expect(page.locator('.modale-migration .ligne-theme li')).toHaveCount(5) // cat_004 supprimé en V1
  await expect(page.locator('.modale-migration .ligne-anon li')).toHaveCount(3)

  // Étape 2 — dossier dédié VIDE → ok, pas d'avertissement.
  await page.locator('.modale-migration .choisir-dossier').click()
  await expect(page.locator('.modale-migration .avertir-non-vide')).toHaveCount(0)
  await expect(page.locator('.modale-migration .valider')).toBeEnabled()

  // Étape 3 — migrer → le corpus SonalPi2 s'ouvre (écran Corpus), la modale ferme.
  await page.locator('.modale-migration .valider').click()
  await attendreCorpus(page)
  await expect(page.locator('.modale-migration')).toHaveCount(0)
  await expect(page.locator('.fil')).toContainText('MonCorpus')

  // Les 3 entretiens du .crp sont migrés (cartes sur l'écran Corpus).
  await expect(page.locator('.carte-ent')).toHaveCount(3)

  // Le CALQUE thématique des cartes est présent DÈS l'arrivée, sans ouvrir
  // d'entretien : les codages des .sonal migrés sont sur disque et le résumé
  // est rafraîchi après les imports (sinon il faudrait un 1er aller-retour
  // dans un entretien pour le voir apparaître).
  await expect(page.locator('.carte-ent .xtr-graph')).not.toHaveCount(0)

  // ── SUR DISQUE ────────────────────────────────────────────────────────────
  const corpus = lireCorpus(dirCible)
  expect(corpus.formatVersion).toBe(FORMAT_VERSION)
  expect(corpus.nom).toBe('MonCorpus')
  expect(corpus.meta).toEqual({ sourceV1: { cheminCrp, dateCreation: null } })
  expect(corpus.lexico).toMatchObject({
    motsOutils: ['le', 'la'],
    regroupements: [{ forme: 'aller', membres: ['allais'] }],
    concatenations: [],
  })
  // Q7 : le codebook = les 5 thèmes que le .crp porte VRAIMENT (cat_004 a été
  // supprimé en V1 → absent en V2, il ne revient pas) ; les 8 cat-json du
  // .sonal N'ONT PAS contaminé les définitions (le .crp fait foi).
  expect(Object.keys(corpus.codebook as Record<string, unknown>).sort()).toEqual([
    'cat_001', 'cat_002', 'cat_003', 'cat_005', 'cat_006',
  ])
  expect(Object.keys(corpus.variables as Record<string, unknown>).sort()).toEqual(['v1', 'v2', 'v3'])
  // Règles du corpus migré — E4 : les règles GLOBALES du .crp (Émilie,
  // Maison des Habitants, Enquêteur) sont écrites à la création, puis
  // l'import d'entretien1.sonal ajoute les SIENNES (Karine→Marie, pas→test,
  // réforme→test2) ; entretien3 n'en porte aucune. Entités disjointes →
  // les deux jeux coexistent (la dédup par alias ne fusionne qu'une entité
  // partagée, le global du .crp restant seul sinon).
  const regles = Object.values(corpus.reglesAnon as Record<string, { entite: string[] }>)
  expect(regles).toHaveLength(6)
  expect(regles.flatMap((r) => r.entite)).toEqual(
    expect.arrayContaining(['Émilie', 'Maison des Habitants', 'Enquêteur', 'Karine', 'pas', 'réforme']),
  )

  const membres = corpus.membership as Record<string, { titre: string }>
  const ids = Object.keys(membres)
  expect(ids).toHaveLength(3)
  const parTitre = Object.fromEntries(Object.entries(membres).map(([id, m]) => [m.titre, id]))

  // entretien1 : .Sonal IMPORTÉ (texte Karine du fixture), pas d'audio, trace rtrPath.
  const e1 = lireEntretien(dirCible, parTitre['entretien1'])
  expect(JSON.stringify(e1.corpsTexte)).toContain('Karine')
  expect(e1.meta.audioRef).toBeNull()
  expect(e1.meta.sourceV1).toEqual({ rtrPath: 'entretien1.sonal' })
  expect(e1.locuteurs.length).toBeGreaterThan(0)

  // sans-sonal : .sonal manquant → entretien VIDE + audio référencé (Q1b).
  const e2 = lireEntretien(dirCible, parTitre['sans-sonal'])
  expect(e2.meta.audioRef).toBe(audioPath)
  expect(e2.meta.sourceV1).toEqual({ rtrPath: 'introuvable.sonal' })
  expect(JSON.stringify(e2.corpsTexte)).not.toContain('Karine')

  // entretien3 : .Sonal importé + audio référencé (v3, aucune copie).
  const e3 = lireEntretien(dirCible, parTitre['entretien3'])
  expect(e3.meta.audioRef).toBe(audioPath)
  expect(e3.meta.sourceV1).toEqual({ rtrPath: 'entretien3.sonal' })
  expect(JSON.stringify(e3.corpsTexte)).toContain('Bonjour') // fixture entretien2.sonal
  expect(existsSync(join(dirCible, 'audio'))).toBe(false) // références, zéro copie

  // RÉCENTS : retour Accueil → le corpus migré est le 1er récent.
  await page.locator('.lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await expect(page.locator('.recents .recent').first()).toContainText('MonCorpus')

  await app.close()
})

test('gardes « on n’écrase jamais » — corpus.json refusé, corpus démo refusé', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1migr-garde-'))
  const cheminCrp = ecrireCrp(profil, 'MonCorpus.crp', 'corpusV1.crp')

  // dirA contient un corpus ordinaire ; dirB contient un corpus exemple.
  const dirA = join(profil, 'deja')
  mkdirSync(dirA, { recursive: true })
  writeFileSync(
    join(dirA, 'corpus.json'),
    JSON.stringify({ formatVersion: 3, codebook: {}, variables: {}, reglesAnon: {}, personnes: {}, membership: {} }),
  )
  const dirB = join(profil, 'demo')
  mkdirSync(dirB, { recursive: true })
  writeFileSync(
    join(dirB, 'corpus.json'),
    JSON.stringify({ formatVersion: 3, codebook: {}, variables: {}, reglesAnon: {}, personnes: {}, membership: {}, demo: { id: 'exemple', exemple: 'synth', usage: 'libre', racineSources: '/x', parcours: {} } }),
  )

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await stuberDialogs(app, cheminCrp, dirA)

  await page.locator('.carte-demo.migrer-corpus').click()
  await page.locator('.modale-migration .choisir-crp').click()
  await expect(page.locator('.modale-migration .apercu-nom')).toHaveText('MonCorpus')

  // Garde corpus.json → refus typé, migration impossible.
  await page.locator('.modale-migration .choisir-dossier').click()
  await expect(page.locator('.modale-migration .msg-migration')).toContainText('déjà un corpus')
  await expect(page.locator('.modale-migration .valider')).toBeDisabled()

  // Garde démo → re-picker sur dirB (re-stub) → message dédié.
  await stuberDialogs(app, cheminCrp, dirB)
  await page.locator('.modale-migration .choisir-dossier').click()
  await expect(page.locator('.modale-migration .msg-migration')).toContainText('mode démo')
  await expect(page.locator('.modale-migration .valider')).toBeDisabled()

  // Rien n'a été écrit nulle part.
  expect(existsSync(join(dirA, 'entretiens'))).toBe(false)
  expect(existsSync(join(dirB, 'entretiens'))).toBe(false)
  await app.close()
})

test('dossier non vide SANS corpus.json → avertissement à confirmer avant de migrer', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1migr-nonvide-'))
  const cheminCrp = ecrireCrp(profil, 'MonCorpus.crp', 'corpusV1.crp')
  const dirCible = join(profil, 'MonCorpus')
  mkdirSync(dirCible, { recursive: true })
  writeFileSync(join(dirCible, 'notes.txt'), 'des fichiers non liés au corpus\n')

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await stuberDialogs(app, cheminCrp, dirCible)

  await page.locator('.carte-demo.migrer-corpus').click()
  await page.locator('.modale-migration .choisir-crp').click()
  await page.locator('.modale-migration .choisir-dossier').click()

  // Avertissement présent, migration BLOQUÉE tant que non coché.
  await expect(page.locator('.modale-migration .avertir-non-vide')).toBeVisible()
  await expect(page.locator('.modale-migration .valider')).toBeDisabled()
  await page.locator('.modale-migration .avertir-non-vide input').check()
  await expect(page.locator('.modale-migration .valider')).toBeEnabled()

  await page.locator('.modale-migration .valider').click()
  await attendreCorpus(page)
  // Le fichier non lié est resté ; le corpus SonalPi2 a posé corpus.json à côté.
  expect(existsSync(join(dirCible, 'notes.txt'))).toBe(true)
  expect(existsSync(join(dirCible, 'corpus.json'))).toBe(true)

  await app.close()
})

test('un `.crp` illisible est refusé dans la modale (raison typée, rien d’écrit)', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1migr-refus-'))
  const cheminMoche = join(profil, 'moche.crp')
  writeFileSync(cheminMoche, '{ pas du json', 'utf8')
  const dirCible = join(profil, 'Cible')

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await stuberDialogs(app, cheminMoche, dirCible)

  await page.locator('.carte-demo.migrer-corpus').click()
  await page.locator('.modale-migration .choisir-crp').click()
  await expect(page.locator('.modale-migration .msg-migration')).toContainText('.crp illisible')
  await expect(page.locator('.modale-migration .apercu-crp')).toHaveCount(0)
  await expect(page.locator('.modale-migration .valider')).toBeDisabled()
  await expect(existsSync(join(dirCible, 'corpus.json'))).toBe(false)

  await app.close()
})

test('multi-crp — un `.crp` → UN dossier dédié, deux migrations indépendantes', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1migr-multi-'))
  const crpA = ecrireCrp(profil, 'A.crp', 'corpusV1.crp')
  const crpB = ecrireCrp(profil, 'B.crp', 'corpusV1-nouveau.crp')
  const dirA = join(profil, 'Corpus A')
  const dirB = join(profil, 'Corpus B')

  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)

  // 1re migration — A → dirA.
  await stuberDialogs(app, crpA, dirA)
  await page.locator('.carte-demo.migrer-corpus').click()
  await page.locator('.modale-migration .choisir-crp').click()
  await page.locator('.modale-migration .choisir-dossier').click()
  await page.locator('.modale-migration .valider').click()
  await attendreCorpus(page)

  // Retour Accueil, 2e migration — B (nom porté par le .crp) → dirB.
  await page.locator('.lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await stuberDialogs(app, crpB, dirB)
  await page.locator('.carte-demo.migrer-corpus').click()
  await page.locator('.modale-migration .choisir-crp').click()
  await expect(page.locator('.modale-migration .apercu-nom')).toHaveText('Mon Projet de Recherche')
  await page.locator('.modale-migration .choisir-dossier').click()
  await page.locator('.modale-migration .valider').click()
  await attendreCorpus(page)

  // Deux corpus SonalPi2 indépendants : A = repli nom de fichier, B = nom du .crp.
  expect(lireCorpus(dirA).nom).toBe('A')
  expect(lireCorpus(dirB).nom).toBe('Mon Projet de Recherche')
  expect((lireCorpus(dirB).meta as Record<string, unknown>)).toEqual({
    sourceV1: { cheminCrp: crpB, dateCreation: '2026-05-01T10:00:00.000Z' },
  })

  await app.close()
})