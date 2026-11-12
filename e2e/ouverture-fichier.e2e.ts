import type {} from '../src/renderer/env'
import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { lancer, ecrireSeedDemo, attendreCorpus as attendreCorpusBase, entrerCorpus, entrerEntretien, fermerAiguillage } from './util'
import { CorpusStore } from '../src/main/corpusStore'
import { ecrireSeedMigrationV1 } from '../test/seedMigrationV1'

async function attendreCorpus(page: Page) {
  await fermerAiguillage(page, 'entretiens')
  await attendreCorpusBase(page)
}

function preparer() {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-externe-profil-'))
  const dir = mkdtempSync(join(tmpdir(), 'sonal-été espace-'))
  ecrireSeedDemo(dir)
  new CorpusStore(dir).poserNom('Cible externe été')
  return { profil, dir, chemin: join(dir, 'corpus.crp') }
}

test('le fichier initial a priorité sur le récent et le même fichier ne réinitialise pas l’éditeur', async () => {
  const { profil, dir, chemin } = preparer()
  const app = await lancer(profil, { fichiers: [chemin] })
  try {
    const page = await app.firstWindow()
    await attendreCorpus(page)
    await expect(page.locator('.fil')).toContainText('Cible externe été')
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir })
    await entrerEntretien(page)
    await page.locator('.editeur').press('End')
    await page.locator('.editeur').pressSequentially(' texte conservé')
    await app.evaluate(({ app }, chemin) => {
      app.emit('open-file', { preventDefault() {} }, chemin)
    }, chemin)
    await expect(page.locator('.editeur')).toBeVisible()
    await expect(page.locator('.editeur')).toContainText('texte conservé')
    expect(existsSync(join(dir, 'corpus.json'))).toBe(false)
  } finally { await app.close() }
})

test('une ouverture externe vide l’autosave avant la bascule et signale les entretiens absents', async () => {
  const { profil, dir, chemin } = preparer()
  rmSync(join(dir, 'entretiens', 'e1.json'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await page.locator('.editeur').press('End')
    await page.locator('.editeur').pressSequentially(' sauvegarde avant ouverture')
    await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, chemin)
    await attendreCorpus(page)
    await expect(page.locator('.banniere.info')).toContainText('Corpus incomplet')
    expect(readFileSync(join(profil, 'corpus', 'entretiens', 'e1.json'), 'utf8')).toContain('sauvegarde avant ouverture')
    expect(existsSync(join(dir, 'entretiens', 'e1.json'))).toBe(false)
  } finally { await app.close() }
})

test('un échec initial reste sur l’accueil sans ouvrir le récent de secours', async () => {
  const { profil, dir } = preparer()
  const app = await lancer(profil, { fichiers: [join(dir, 'absent.crp')] })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.ecran.accueil')).toBeVisible()
    await expect(page.locator('.banniere.refus')).toContainText('Ouverture du corpus refusée')
    await expect(page.locator('.corpus-ecran')).not.toBeVisible()
  } finally { await app.close() }
})

test('le sélecteur ouvre strictement un CRP et refuse un miroir géré aussi via le parcours dossier', async () => {
  const { profil, dir, chemin } = preparer()
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.ecran.accueil')).toBeVisible()
    await app.evaluate(({ dialog }, chemin) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
    }, chemin)
    await page.locator('.ouvrir-corpus').click()
    await attendreCorpus(page)
    await expect(page.locator('.fil')).toContainText('Cible externe été')
    const miroir = join(profil, 'miroirs', 'inconnu')
    ecrireSeedDemo(miroir)
    const refus = await page.evaluate(async (miroir) => {
      const erreurs: string[] = []
      for (const fn of [() => window.sonal.ouverture.preparer(`${miroir}/corpus.crp`), () => window.sonal.corpus.ouvrirDossier(miroir)]) {
        try { await fn() } catch (e) { erreurs.push(String(e)) }
      }
      return erreurs
    }, miroir)
    expect(refus).toHaveLength(2)
    expect(refus.every((s) => /miroir géré/.test(s))).toBe(true)
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir })
  } finally { await app.close() }
})

test('migration proposée depuis l’entretien : demande concurrente refusée, puis nouvelle tentative possible', async () => {
  const { profil, dir, chemin } = preparer()
  const v1 = join(profil, 'Ancien libre.crp')
  const original = readFileSync(join(process.cwd(), 'test', 'fixtures', 'corpusV1.crp'))
  writeFileSync(v1, original)
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await entrerEntretien(page)
    await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, v1)
    await expect(page.locator('.modale-migration')).toBeVisible()
    await expect(page.locator('.choisir-crp')).toContainText('Ancien libre.crp')
    await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, chemin)
    await expect(page.locator('.editeur')).toBeVisible()
    await expect(page.locator('.modale-migration')).toBeVisible()
    await expect(page.locator('.banniere.info')).toContainText('Une ouverture est déjà en cours')
    await page.locator('.modale-migration .annuler').click()
    await expect(page.locator('.editeur')).toBeVisible()
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir: join(profil, 'corpus') })
    expect(readFileSync(v1)).toEqual(original)
    await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, chemin)
    await attendreCorpus(page)
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir })
  } finally { await app.close() }
})

test('migration V1 reçue au démarrage puis confirmée dans un dossier dédié', async () => {
  const { profil } = preparer()
  const source = ecrireSeedMigrationV1(profil, 'À migrer.crp')
  const cible = join(profil, 'À migrer - SonalPi2')
  const app = await lancer(profil, { fichiers: [source.cheminCrp] })
  try {
    const page = await app.firstWindow()
    await expect(page.locator('.modale-migration')).toBeVisible()
    await expect(page.locator('.modale-migration .valider')).toBeEnabled()
    await page.locator('.modale-migration .valider').click()
    await attendreCorpus(page)
    expect(existsSync(join(cible, 'corpus.crp'))).toBe(true)
    expect(existsSync(join(cible, 'corpus.json'))).toBe(false)
    expect(existsSync(source.cheminCrp)).toBe(false)
    expect(readFileSync(`${source.cheminCrp}.sauvegarde-v1`)).toEqual(source.original)
  } finally { await app.close() }
})

test('le paquet Linux non installé inclut le preload, le renderer et les dépendances de lecture', async () => {
  const executable = process.env.CRP_E2E_EXECUTABLE
  test.skip(process.platform !== 'linux' || !executable || !existsSync(executable), 'Définir CRP_E2E_EXECUTABLE pour tester un paquet Linux reconstruit.')
  const { profil, chemin } = preparer()
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ executablePath: executable, args: ['--no-sandbox', `--user-data-dir=${profil}`, chemin], env: env as Record<string, string> })
  try {
    const page = await app.firstWindow()
    await attendreCorpus(page)
    await expect(page.locator('.fil')).toContainText('Cible externe été')
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
  } finally { await app.close() }
})

test('une seconde instance du même profil transmet un chemin relatif à la première', async () => {
  const { profil, dir, chemin } = preparer()
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].minimize() })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const cwdEmetteur = dirname(dir)
    const enfant = spawn(app.process().spawnfile, [process.cwd(), '--no-sandbox', `--user-data-dir=${profil}`, relative(cwdEmetteur, chemin)], { cwd: cwdEmetteur, env, stdio: 'ignore' })
    const [code] = await once(enfant, 'exit')
    expect(code).toBe(0)
    await attendreCorpus(page)
    await expect(page.locator('.fil')).toContainText('Cible externe été')
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir })
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false)
  } finally { await app.close() }
})
