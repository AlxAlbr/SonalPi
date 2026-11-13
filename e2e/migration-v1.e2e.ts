import type {} from '../src/renderer/env'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lancer, attendreAccueil, attendreCorpus, entrerCorpus, entrerEntretien } from './util'
import { ecrireSeedMigrationV1 } from '../test/seedMigrationV1'
import type { CorpusFichier, EntretienFichier } from '../src/shared/format'

async function stuberDialogs(app: ElectronApplication, crp: string, emplacement: string) {
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async (...a: unknown[]) => {
      const options = a[a.length - 1] as { filters?: { extensions: string[] }[] }
      const fichier = options.filters?.some((f) => f.extensions.includes('crp'))
      return { canceled: false, filePaths: [fichier ? args.crp : args.emplacement] }
    }
  }, { crp, emplacement })
}
async function choisirSource(page: Page) {
  await page.locator('.carte-demo.ouvrir-corpus').click()
  await expect(page.locator('.modale-migration .valider')).toBeEnabled()
}
function corpus(dir: string): CorpusFichier {
  return JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))
}
function entretiens(dir: string): Record<string, EntretienFichier> {
  return Object.fromEntries(Object.entries(corpus(dir).membership).map(([id, ref]) => [
    ref.titre, JSON.parse(readFileSync(join(dir, 'entretiens', `${id}.json`), 'utf8')),
  ]))
}

test('un seul nom, migration complète sans bilan, médias internes copiés et CRP V1 renommé après ouverture', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-complet-'))
  const source = ecrireSeedMigrationV1(profil)
  const cible = join(profil, 'MonCorpus - SonalPi2')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await expect(page.locator('.migrer-corpus')).toHaveCount(0)
    await expect(page.locator('.ouvrir-corpus')).toContainText('Fichier .crp')
    await stuberDialogs(app, source.cheminCrp, profil)
    await choisirSource(page)
    const modale = page.locator('.modale-migration')
    await expect(modale.locator('.nom-corpus')).toHaveValue('MonCorpus')
    await expect(modale.locator('.destination')).toContainText(cible)
    await expect(modale.locator('.apercu-crp, .ligne-theme, .ligne-variable, .ligne-anon')).toHaveCount(0)
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
    expect(existsSync(cible)).toBe(false)
    await modale.locator('.valider').click()
    await attendreCorpus(page)
    await expect(modale).not.toBeVisible()
    await expect(page.locator('.fil')).toContainText('MonCorpus')
    await expect(page.locator('.carte-ent')).toHaveCount(3)
    await expect(page.locator('.carte-ent .xtr-graph')).not.toHaveCount(0)
    expect(existsSync(source.cheminCrp)).toBe(false)
    expect(readFileSync(`${source.cheminCrp}.sauvegarde-v1`)).toEqual(source.original)
    const c = corpus(cible)
    expect(c.formatVersion).toBe(9)
    expect(c.nom).toBe('MonCorpus')
    expect(c.meta).toEqual({ sourceV1: { cheminCrp: source.cheminCrp, dateCreation: null } })
    expect(Object.keys(c.codebook).sort()).toEqual(['cat_001', 'cat_002', 'cat_003', 'cat_005', 'cat_006'])
    expect(Object.keys(c.variables).sort()).toEqual(['v1', 'v2', 'v3'])
    expect(Object.values(c.reglesAnon).flatMap((r) => r.entite)).toEqual(expect.arrayContaining([
      'Émilie', 'Maison des Habitants', 'Enquêteur', 'Karine', 'pas', 'réforme',
    ]))
    const es = entretiens(cible)
    expect(JSON.stringify(es.entretien1.corpsTexte)).toContain('Karine')
    expect(es.entretien1.locuteurs.length).toBeGreaterThan(0)
    expect(es.entretien1.meta.sourceV1).toEqual({ rtrPath: 'entretien1.sonal' })
    expect(es.entretien1.meta.audioRef).toBe(es.entretien3.meta.audioRef)
    expect(readFileSync(es.entretien1.meta.audioRef!)).toEqual(readFileSync(source.audioInterne))
    expect(readdirSync(join(cible, 'medias'))).toHaveLength(1)
    expect(es['audio seul'].meta.audioRef).toBe(source.audioExterne)
    expect(JSON.stringify(es.entretien3.corpsTexte)).toContain('Bonjour')
    renameSync(source.dossierV1, `${source.dossierV1}-indisponible`)
    expect(readFileSync(es.entretien1.meta.audioRef!).length).toBeGreaterThan(0)
    expect(readFileSync(source.audioExterne).length).toBeGreaterThan(0)
    expect(existsSync(join(cible, 'corpus.json'))).toBe(false)
    await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
    await expect(page.locator('.recents .recent').first()).toContainText('MonCorpus')
  } finally { await app.close() }
})

test('le passage depuis un entretien sauvegarde son texte avant de changer de corpus', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-autosave-'))
  const source = ecrireSeedMigrationV1(profil)
  const ancien = join(profil, 'corpus')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    const id = Object.keys(corpus(ancien).membership)[0]
    await page.locator('.editeur').click()
    await page.keyboard.press('Control+Home')
    await page.keyboard.insertText('AUTOSAVE-AVANT-MIGRATION ')
    await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, source.cheminCrp)
    await expect(page.locator('.modale-migration .valider')).toBeEnabled()
    await page.locator('.modale-migration .valider').click()
    await attendreCorpus(page)
    await expect(page.locator('.modale-migration')).not.toBeVisible()
    const sauvegarde = JSON.parse(readFileSync(join(ancien, 'entretiens', `${id}.json`), 'utf8'))
    expect(JSON.stringify(sauvegarde.corpsTexte)).toContain('AUTOSAVE-AVANT-MIGRATION')
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir: join(profil, 'MonCorpus - SonalPi2') })
    expect(existsSync(`${source.cheminCrp}.sauvegarde-v1`)).toBe(true)
  } finally { await app.close() }
})

test('changer le nom et l’emplacement propose un dossier libre, sans second nom à saisir', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-nom-'))
  const source = ecrireSeedMigrationV1(profil)
  const sansNom = JSON.parse(readFileSync(source.cheminCrp, 'utf8'))
  delete sansNom.nom
  writeFileSync(source.cheminCrp, JSON.stringify(sansNom))
  const parent = join(profil, 'autre-emplacement')
  mkdirSync(parent)
  const deja = join(parent, 'Nouveau nom - SonalPi2')
  mkdirSync(deja)
  writeFileSync(join(deja, 'notes.txt'), 'À conserver')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, source.cheminCrp, parent)
    await choisirSource(page)
    await expect(page.locator('.nom-corpus')).toHaveValue('MonCorpus')
    await page.locator('.nom-corpus').fill('Nouveau nom')
    await page.locator('.choisir-dossier').click()
    await expect(page.locator('.destination')).toContainText(`${deja} (2)`)
    await page.locator('.modale-migration .valider').click()
    await attendreCorpus(page)
    await expect(page.locator('.modale-migration')).not.toBeVisible()
    expect(corpus(`${deja} (2)`).nom).toBe('Nouveau nom')
    expect(readFileSync(join(deja, 'notes.txt'), 'utf8')).toBe('À conserver')
  } finally { await app.close() }
})

test('annuler la préparation conserve le corpus courant et les sources, puis permet une nouvelle ouverture', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-annuler-'))
  const source = ecrireSeedMigrationV1(profil)
  const fd = openSync(source.audioInterne, 'r+')
  ftruncateSync(fd, 512 * 1024 * 1024)
  closeSync(fd)
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, source.cheminCrp, profil)
    await choisirSource(page)
    const avant = readFileSync(join(profil, 'corpus', 'corpus.crp'))
    await page.locator('.modale-migration .valider').click()
    await expect(page.locator('.progression-migration')).toBeVisible()
    await page.locator('.modale-migration .annuler').click()
    await expect(page.locator('.modale-migration')).not.toBeVisible()
    expect(readFileSync(join(profil, 'corpus', 'corpus.crp'))).toEqual(avant)
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
    expect(existsSync(`${source.cheminCrp}.sauvegarde-v1`)).toBe(false)
    expect(existsSync(join(profil, 'MonCorpus - SonalPi2'))).toBe(false)
    expect(readdirSync(profil).filter((f) => f.startsWith('.sonal-migration-'))).toEqual([])
    await page.locator('.recents .recent').first().click()
    await attendreCorpus(page)
  } finally {
    await app.close()
    rmSync(profil, { recursive: true, force: true })
  }
})

test('un nettoyage refusé protège les fichiers apparus et libère la migration pour une nouvelle tentative', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-nettoyage-'))
  const source = ecrireSeedMigrationV1(profil)
  const demande = { cheminCrp: source.cheminCrp, nom: 'MonCorpus', dossier: join(profil, 'Migration-non-active') }
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await page.evaluate((req) => window.sonal.migrer.preparer(req), demande)
    const temporaire = join(profil, readdirSync(profil).find((f) => f.startsWith('.sonal-migration-'))!)
    renameSync(temporaire, `${temporaire}-deplace`)
    mkdirSync(temporaire)
    writeFileSync(join(temporaire, 'notes.txt'), 'Travail à conserver')
    const erreur = await page.evaluate(async () => {
      try { await window.sonal.migrer.annuler(); return '' }
      catch (e) { return String(e) }
    })
    expect(erreur).toContain('Nettoyage impossible')
    expect(erreur).toContain(temporaire)
    expect(readFileSync(join(temporaire, 'notes.txt'), 'utf8')).toBe('Travail à conserver')
    await page.evaluate((req) => window.sonal.migrer.preparer(req), demande)
    await page.evaluate(() => window.sonal.migrer.annuler())
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
    expect(existsSync(demande.dossier)).toBe(false)
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir: join(profil, 'corpus') })
  } finally {
    await app.close()
    rmSync(profil, { recursive: true, force: true })
  }
})

test('une source manquante bloque la migration sans bascule et sans entretien vide', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-manquant-'))
  const source = ecrireSeedMigrationV1(profil)
  rmSync(source.audioExterne)
  const cible = join(profil, 'MonCorpus - SonalPi2')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, source.cheminCrp, profil)
    await choisirSource(page)
    await page.locator('.modale-migration .valider').click()
    await expect(page.locator('.msg-migration')).toContainText('Fichiers référencés manquants ou illisibles')
    expect(existsSync(cible)).toBe(false)
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
    expect(readdirSync(profil).filter((f) => f.startsWith('.sonal-migration-'))).toEqual([])
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir: join(profil, 'corpus') })
    await page.locator('.modale-migration .annuler').click()
    await expect(page.locator('.ecran.accueil')).toBeVisible()
  } finally { await app.close() }
})

test('une transcription illisible bloque et nettoie la cible non active', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-illisible-'))
  const source = ecrireSeedMigrationV1(profil)
  writeFileSync(join(source.dossierV1, 'entretien1.sonal'), '<html>Pas une transcription Sonal</html>')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, source.cheminCrp, profil)
    await choisirSource(page)
    await page.locator('.modale-migration .valider').click()
    await expect(page.locator('.msg-migration')).toContainText('Entretien illisible')
    expect(existsSync(join(profil, 'MonCorpus - SonalPi2'))).toBe(false)
    expect(readdirSync(profil).filter((f) => f.startsWith('.sonal-migration-'))).toEqual([])
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
  } finally { await app.close() }
})

test('la destination ne peut pas être dans les sources et un CRP corrompu reste refusé', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-refus-'))
  const source = ecrireSeedMigrationV1(profil)
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, source.cheminCrp, source.dossierV1)
    await choisirSource(page)
    await page.locator('.choisir-dossier').click()
    await expect(page.locator('.msg-migration')).toContainText('en dehors du dossier SonalPi1')
    await expect(page.locator('.modale-migration .valider')).toBeDisabled()
    const invalide = join(profil, 'invalide.crp')
    writeFileSync(invalide, '{ pas du JSON')
    await stuberDialogs(app, invalide, profil)
    await page.locator('.choisir-crp').click()
    await expect(page.locator('.msg-migration')).toContainText('.crp illisible')
    await expect(page.locator('.modale-migration .valider')).toBeDisabled()
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
  } finally { await app.close() }
})

test('deux CRP du même dossier donnent deux corpus distincts, sans utiliser le nom interne V1', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-multi-'))
  const a = ecrireSeedMigrationV1(profil, 'A.crp')
  const crpB = join(a.dossierV1, 'B.crp')
  const bOriginal = JSON.stringify({ nom: 'Ancien nom JSON', version: '1.0', dateCreation: '2026-05-01T10:00:00.000Z', tabEnt: [] })
  writeFileSync(crpB, bOriginal)
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, a.cheminCrp, profil)
    await choisirSource(page)
    await page.locator('.modale-migration .valider').click()
    await attendreCorpus(page)
    await expect(page.locator('.modale-migration')).not.toBeVisible()
    await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
    await stuberDialogs(app, crpB, profil)
    await choisirSource(page)
    await expect(page.locator('.nom-corpus')).toHaveValue('B')
    await page.locator('.modale-migration .valider').click()
    await attendreCorpus(page)
    await expect(page.locator('.modale-migration')).not.toBeVisible()
    const dirA = join(profil, 'A - SonalPi2')
    const dirB = join(profil, 'B - SonalPi2')
    expect(corpus(dirA).nom).toBe('A')
    expect(Object.keys(corpus(dirA).membership)).toHaveLength(3)
    expect(corpus(dirB).nom).toBe('B')
    expect(corpus(dirB).membership).toEqual({})
    expect(corpus(dirB).meta?.sourceV1?.dateCreation).toBe('2026-05-01T10:00:00.000Z')
    expect(readFileSync(`${a.cheminCrp}.sauvegarde-v1`)).toEqual(a.original)
    expect(readFileSync(`${crpB}.sauvegarde-v1`, 'utf8')).toBe(bOriginal)
  } finally { await app.close() }
})

test('une sauvegarde déjà présente n’est pas écrasée et la V2 reste ouverte avec un avertissement unique', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-v1-collision-'))
  const source = ecrireSeedMigrationV1(profil)
  writeFileSync(`${source.cheminCrp}.sauvegarde-v1`, 'Ancienne sauvegarde')
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await stuberDialogs(app, source.cheminCrp, profil)
    await choisirSource(page)
    await page.locator('.modale-migration .valider').click()
    await attendreCorpus(page)
    await expect(page.locator('.modale-migration')).not.toBeVisible()
    await expect(page.locator('.banniere.info')).toContainText('n’a pas pu être renommé')
    expect(readFileSync(source.cheminCrp)).toEqual(source.original)
    expect(readFileSync(`${source.cheminCrp}.sauvegarde-v1`, 'utf8')).toBe('Ancienne sauvegarde')
  } finally { await app.close() }
})
