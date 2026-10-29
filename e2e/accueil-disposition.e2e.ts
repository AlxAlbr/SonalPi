import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lancer, attendreAccueil, ecrireSeedDemo } from './util'
import type { CorpusFichier } from '../src/shared/format'
import { intercepterOuverturesAide, lireOuverturesAide } from './aide-util'

const ordreBlocs = (page: Page) => page.locator('.bloc-accueil h3').evaluateAll((titres) => titres.map((titre) => titre.id))

function preparer(vide = false) {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-accueil-ux-'))
  const profil = join(racine, 'profil')
  mkdirSync(profil)
  const personnel = join(racine, 'Enquete_associations')
  const homonyme = join(racine, 'Corpus_annote')
  const exemple = join(racine, 'Copie_entretiens_importes')
  for (const dir of [personnel, homonyme, exemple]) ecrireSeedDemo(dir)
  const fichier = join(exemple, 'corpus.json')
  const corpus = JSON.parse(readFileSync(fichier, 'utf8')) as CorpusFichier
  corpus.demo = { id: 'copie-libre-ux', exemple: 'synth', usage: 'libre', racineSources: join(racine, 'sources'), parcours: {} }
  writeFileSync(fichier, JSON.stringify(corpus))
  writeFileSync(join(profil, 'settings.json'), JSON.stringify({ recents: vide ? [] : [personnel, exemple, homonyme] }))
  return { racine, profil, personnel, exemple, homonyme }
}

test('accueil : deux étages, copies séparées, priorité aux récents et clavier en fenêtre étroite', async () => {
  const fixture = preparer()
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 800))
    await attendreAccueil(page)
    await expect(page.locator('.decouverte-bloc .carte-demo')).toHaveCount(4)
    await expect(page.locator('.decouverte-bloc .exemples')).toBeVisible()
    await expect(page.locator('.exemples-bloc .carte-demo, .recents-bloc .carte-demo')).toHaveCount(0)
    for (const selecteur of ['.exemples-bloc', '.recents-bloc']) {
      await expect(page.locator(selecteur)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(page.locator(selecteur)).toHaveCSS('border-top-width', '0px')
      await expect(page.locator(selecteur)).toHaveCSS('border-radius', '0px')
      await expect(page.locator(selecteur)).toHaveCSS('box-shadow', 'none')
    }
    const personnel = page.getByRole('list', { name: 'Corpus récents', exact: true })
    const copies = page.getByRole('list', { name: 'Copies d’exemples récentes', exact: true })
    await expect(personnel.locator('.recent')).toHaveCount(2)
    await expect(personnel).toContainText('Corpus_annote')
    await expect(copies.locator('.recent')).toHaveCount(1)
    await expect(copies).toContainText('Copie_entretiens_importes')
    await expect(page.locator('#titre-exemples')).toHaveCSS('text-decoration-line', 'underline')
    await expect(page.locator('#titre-recents')).toHaveCSS('text-decoration-line', 'underline')
    await expect(page.locator('#titre-recents')).toHaveCSS('color', 'rgb(28, 92, 51)')
    await expect(personnel.locator('.recent-nom').first()).toHaveCSS('color', 'rgb(28, 92, 51)')
    await expect(copies.locator('.recent-nom').first()).toHaveCSS('color', 'rgb(23, 93, 158)')
    await expect(page.locator('.corpus-bloc')).toHaveCSS('background-color', 'rgb(237, 247, 237)')
    expect((await copies.boundingBox())!.x).toBeGreaterThan((await page.locator('#titre-exemples').boundingBox())!.x)
    expect((await personnel.boundingBox())!.x).toBeGreaterThan((await page.locator('#titre-recents').boundingBox())!.x)
    const entrees = await page.evaluate(() => window.sonal.corpus.recents())
    expect(entrees.find((r) => r.type === 'local' && r.dir === fixture.exemple)).toMatchObject({ exemple: 'synth' })
    expect(entrees.find((r) => r.type === 'local' && r.dir === fixture.homonyme)).not.toHaveProperty('exemple')
    const cadres = await page.locator('.bloc-accueil').evaluateAll((blocs) => blocs.map((bloc) => {
      const { x, y } = bloc.getBoundingClientRect()
      return { x, y }
    }))
    expect(cadres[0].x).toBeLessThan(cadres[1].x)
    expect(cadres[0].y).toBe(cadres[1].y)
    expect(cadres[2].y).toBe(cadres[3].y)
    const premierRecent = (await personnel.locator('.recent').first().boundingBox())!
    expect(premierRecent.y + premierRecent.height).toBeLessThan(await page.evaluate(() => innerHeight))
    await expect(page.locator('.migration-bloc')).not.toHaveAttribute('open')
    await page.screenshot({ path: 'test-results/accueil-deux-colonnes.png' })

    await fenetre.evaluate((w) => w.setContentSize(700, 800))
    await expect.poll(() => ordreBlocs(page)).toEqual(['titre-recents', 'titre-corpus', 'titre-decouverte', 'titre-exemples'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await personnel.locator('.recent').first().focus()
    await page.keyboard.press('Tab')
    await expect(personnel.locator('.oubli-recent').first()).toBeFocused()
    await page.screenshot({ path: 'test-results/accueil-etroit.png' })
    await fenetre.evaluate((w) => w.setContentSize(1280, 800))
    await expect.poll(() => ordreBlocs(page)).toEqual(['titre-decouverte', 'titre-exemples', 'titre-corpus', 'titre-recents'])

    await copies.locator('.recent').click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    expect((await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir).toBe(fixture.exemple)
    await page.locator('.fil .lien-nav').filter({ hasText: 'Accueil' }).click()
    await copies.locator('.oubli-recent').click()
    await expect(copies).toHaveCount(0)
    await expect(page.locator('.exemples-bloc')).toHaveCount(0)
    expect(existsSync(join(fixture.exemple, 'corpus.json'))).toBe(true)
    await expect(personnel.locator('.recent')).toHaveCount(2)
    await personnel.locator('.oubli-recent').first().click()
    await expect(personnel.locator('.recent')).toHaveCount(1)
    await personnel.locator('.oubli-recent').first().click()
    await expect(page.locator('.recents-bloc')).toHaveCount(0)
    expect(existsSync(join(fixture.personnel, 'corpus.json'))).toBe(true)
    expect(existsSync(join(fixture.homonyme, 'corpus.json'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('accueil : de nombreuses copies et des noms longs ne repoussent pas les corpus personnels', async () => {
  const fixture = preparer()
  const copies = [fixture.exemple]
  for (let i = 0; i < 5; i++) {
    const dir = join(fixture.racine, `Une_copie_avec_un_nom_tres_long_pour_verifier_la_place_${i}`)
    ecrireSeedDemo(dir)
    const corpus = JSON.parse(readFileSync(join(fixture.exemple, 'corpus.json'), 'utf8')) as CorpusFichier
    corpus.demo!.id += `-${i}`
    writeFileSync(join(dir, 'corpus.json'), JSON.stringify(corpus))
    copies.push(dir)
  }
  writeFileSync(join(fixture.profil, 'settings.json'), JSON.stringify({ recents: [fixture.personnel, ...copies, fixture.homonyme] }))
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1024, 768))
    await attendreAccueil(page)
    const liste = page.getByRole('list', { name: 'Copies d’exemples récentes', exact: true })
    await expect(liste.locator('.recent')).toHaveCount(6)
    expect(await liste.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
    const recent = (await page.getByRole('list', { name: 'Corpus récents', exact: true }).locator('.recent').first().boundingBox())!
    expect(recent.y + recent.height).toBeLessThan(await page.evaluate(() => innerHeight))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally {
    await app.close()
  }
})

test('accueil : guide et FAQ utilisent les mêmes pages que le menu sans changer le corpus', async () => {
  const fixture = preparer()
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    const avant = await page.evaluate(() => window.sonal.corpus.dossierCourant())
    const fichiers = [fixture.personnel, fixture.homonyme, fixture.exemple].map((dir) => readFileSync(join(dir, 'corpus.json'), 'utf8'))
    await intercepterOuverturesAide(app)
    await page.locator('.carte-demo.documentation').click()
    await page.locator('.carte-demo.faq').click()
    await expect.poll(async () => (await lireOuverturesAide(app)).fichiers.length).toBe(2)
    const ouverts = (await lireOuverturesAide(app)).fichiers
    expect(ouverts[0]).toMatch(/[/\\]index\.html$/)
    expect(ouverts[1]).toMatch(/[/\\]faq[/\\]premiers-pas\.html$/)
    expect(await app.windows()).toHaveLength(1)
    await expect(page.locator('.accueil')).toBeVisible()
    expect(await page.evaluate(() => window.sonal.corpus.dossierCourant())).toEqual(avant)
    expect([fixture.personnel, fixture.homonyme, fixture.exemple].map((dir) => readFileSync(join(dir, 'corpus.json'), 'utf8'))).toEqual(fichiers)
    const refus = await page.evaluate(async () => {
      try { await window.sonal.application.ouvrirDocumentation('../autre' as 'guide'); return false } catch { return true }
    })
    expect(refus).toBe(true)
    expect((await lireOuverturesAide(app)).fichiers).toHaveLength(2)
    if (process.env.ACCUEIL_E2E_EXECUTABLE) {
      expect(await app.evaluate(({ app: application }) => application.isPackaged)).toBe(true)
      expect(ouverts[0]).toContain('resources/documentation')
    }
  } finally {
    await app.close()
  }
})

for (const groupe of ['exemples', 'personnels'] as const) {
  test(`accueil : une seule liste (${groupe}) garde sa place et l’autre reste absente`, async () => {
    const fixture = preparer()
    writeFileSync(join(fixture.profil, 'settings.json'), JSON.stringify({
      recents: groupe === 'exemples' ? [fixture.exemple] : [fixture.personnel, fixture.homonyme],
    }))
    const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
    try {
      const page = await app.firstWindow()
      const fenetre = await app.browserWindow(page)
      await fenetre.evaluate((w) => w.setContentSize(1280, 800))
      await attendreAccueil(page)
      await expect(page.locator('.exemples-bloc')).toHaveCount(groupe === 'exemples' ? 1 : 0)
      await expect(page.locator('.recents-bloc')).toHaveCount(groupe === 'personnels' ? 1 : 0)
      const decouverte = (await page.locator('.decouverte-bloc').boundingBox())!
      const corpus = (await page.locator('.corpus-bloc').boundingBox())!
      expect(corpus.x).toBe(decouverte.x)
      expect(corpus.y).toBeGreaterThan(decouverte.y)
      const liste = (await page.locator(groupe === 'exemples' ? '.exemples-bloc' : '.recents-bloc').boundingBox())!
      expect(liste.x).toBeGreaterThan(corpus.x)
      expect(liste.y).toBe(groupe === 'exemples' ? decouverte.y : corpus.y)
      await fenetre.evaluate((w) => w.setContentSize(700, 800))
      await expect.poll(() => ordreBlocs(page)).toEqual(groupe === 'exemples'
        ? ['titre-corpus', 'titre-decouverte', 'titre-exemples']
        : ['titre-recents', 'titre-corpus', 'titre-decouverte'])
    } finally {
      await app.close()
    }
  })
}

test('accueil : sans récent, les actions restent disponibles et la migration se déplie au clavier', async () => {
  const fixture = preparer(true)
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await expect(page.locator('.recents-bloc, .exemples-bloc')).toHaveCount(0)
    await expect(page.locator('#titre-recents, #titre-exemples')).toHaveCount(0)
    await expect(page.locator('.ouvrir-corpus')).toBeEnabled()
    await expect(page.locator('.decouverte-bloc .exemples')).toBeEnabled()
    await page.screenshot({ path: 'test-results/accueil-sans-recents.png' })
    const rubrique = page.locator('.migration-bloc')
    await rubrique.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(rubrique).toHaveAttribute('open')
    const cadreCorpus = (await page.locator('.corpus-bloc').boundingBox())!
    const cadreMigration = (await rubrique.boundingBox())!
    expect(cadreMigration.x).toBe(cadreCorpus.x)
    expect(cadreMigration.width).toBe(cadreCorpus.width)
    expect(cadreMigration.y).toBeGreaterThanOrEqual(cadreCorpus.y + cadreCorpus.height)
    const locale = (await rubrique.locator('.migrer-corpus').boundingBox())!
    const gitlab = (await rubrique.locator('.migrer-gitlab').boundingBox())!
    expect(gitlab.x).toBe(locale.x)
    expect(gitlab.y).toBeGreaterThanOrEqual(locale.y + locale.height)
    await rubrique.locator('.migrer-corpus').click()
    await expect(page.locator('.modale-migration')).toBeVisible()
  } finally {
    await app.close()
  }
})
