import type {} from '../src/renderer/env'
import { test, expect, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { lancer, entrerCorpus, attendreAccueil } from './util'

/** Clique « Renommer le corpus… » dans le menu Corpus de l'application. */
async function renommerDepuisMenu(app: ElectronApplication) {
  await app.evaluate(({ Menu }) => {
    const corpus = Menu.getApplicationMenu()!.items.find((item) => item.label === 'Corpus')!.submenu!
    const renommer = corpus.items.find((item) => item.label === 'Renommer le corpus…')!
    if (!renommer.enabled) throw new Error('Renommer le corpus est grisé.')
    renommer.click()
  })
}

test('renommer le projet change l’en-tête et les récents, sans modifier le dossier ni les entretiens', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-nom-e2e-'))
  const dir = join(profil, 'corpus')
  let app = await lancer(profil)
  try {
    let page = await app.firstWindow()
    await entrerCorpus(page)
    const entretienAvant = readFileSync(join(dir, 'entretiens', 'e1.json'))
    const corpusAvant = await page.evaluate(() => window.sonal.corpus.ouvrir())
    await renommerDepuisMenu(app)
    const modale = page.locator('.modale-renommer-corpus')
    await expect(modale.locator('input')).toHaveValue(basename(dir))
    await modale.locator('input').fill('   ')
    await expect(modale.locator('button[type=submit]')).toBeDisabled()
    await modale.locator('input').fill('  Enquête été  ')
    await modale.locator('button[type=submit]').click()
    await expect(modale).not.toBeVisible()
    await expect(page.locator('.fil')).toContainText('Enquête été')
    expect(JSON.parse(readFileSync(join(dir, 'corpus.crp'), 'utf8'))).toEqual({ ...corpusAvant, nom: 'Enquête été' })
    expect(readFileSync(join(dir, 'entretiens', 'e1.json'))).toEqual(entretienAvant)
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toMatchObject({ dir, nom: 'Enquête été' })
    await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
    await expect(page.locator('.recents .recent').first()).toContainText('Enquête été')
    await app.close()
    app = await lancer(profil, { preserverSettings: true })
    page = await app.firstWindow()
    await attendreAccueil(page)
    await expect(page.locator('.recents .recent').first()).toContainText('Enquête été')
    await page.locator('.recents .recent').first().click()
    await expect(page.locator('.fil')).toContainText('Enquête été')
  } finally { await app.close() }
})

test('annuler le renommage n’écrit rien et une demande externe n’est pas mise en attente', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-nom-annulation-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    const avant = readFileSync(join(profil, 'corpus', 'corpus.crp'))
    await renommerDepuisMenu(app)
    const modale = page.locator('.modale-renommer-corpus')
    await modale.locator('input').fill('Non enregistré')
    await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, join(profil, 'inexistant.crp'))
    await expect(page.locator('.banniere.info')).toContainText('Une ouverture est déjà en cours')
    await modale.getByRole('button', { name: 'Annuler' }).click()
    expect(readFileSync(join(profil, 'corpus', 'corpus.crp'))).toEqual(avant)
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await expect(page.locator('.banniere.refus')).toHaveCount(0)
    await renommerDepuisMenu(app)
    await expect(modale.locator('input')).toHaveValue('corpus')
    await modale.getByRole('button', { name: 'Annuler' }).click()
  } finally { await app.close() }
})
