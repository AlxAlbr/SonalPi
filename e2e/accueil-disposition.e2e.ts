import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { lancer, attendreAccueil, ecrireSeedDemo } from './util'
import type { CorpusFichier } from '../src/shared/format'
import { intercepterOuverturesAide, lireOuverturesAide } from './aide-util'

function preparer(vide = false) {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-accueil-ux-'))
  const profil = join(racine, 'profil')
  mkdirSync(profil)
  const personnel = join(racine, 'Enquete_associations')
  const homonyme = join(racine, 'Corpus_annote')
  const exemple = join(racine, 'Copie_entretiens_importes')
  for (const dir of [personnel, homonyme, exemple]) ecrireSeedDemo(dir)
  const fichier = join(exemple, 'corpus.crp')
  const corpus = JSON.parse(readFileSync(fichier, 'utf8')) as CorpusFichier
  corpus.demo = { id: 'copie-libre-ux', exemple: 'synth', usage: 'libre', racineSources: join(racine, 'sources'), parcours: {} }
  writeFileSync(fichier, JSON.stringify(corpus))
  writeFileSync(join(profil, 'settings.json'), JSON.stringify({ recents: vide ? [] : [personnel, exemple, homonyme] }))
  return { racine, profil, personnel, exemple, homonyme }
}

test('accueil : actions en tête, récents en onglets, apprentissage à côté et clavier en fenêtre étroite', async () => {
  const fixture = preparer()
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 800))
    await attendreAccueil(page)
    await expect(page.getByRole('heading', { name: 'Vos corpus', level: 2 })).toBeVisible()
    await expect(page.locator('.actions-corpus .carte-demo')).toHaveCount(4)
    await expect(page.locator('.decouverte-bloc .carte-demo')).toHaveCount(4)
    await expect(page.locator('.recents-bloc .carte-demo')).toHaveCount(0)
    await expect(page.locator('.recherche')).toHaveCount(0)

    // L'onglet « Mes corpus » est actif par défaut ; les copies d'exemples sont dans l'autre.
    const ongletTravail = page.getByRole('tab', { name: /Mes corpus/ })
    const ongletExemples = page.getByRole('tab', { name: /Copies d’exemples/ })
    await expect(ongletTravail).toHaveAttribute('aria-selected', 'true')
    await expect(ongletTravail).toContainText('2')
    await expect(ongletExemples).toContainText('1')
    const personnel = page.getByRole('list', { name: 'Corpus récents', exact: true })
    await expect(personnel.locator('.recent')).toHaveCount(2)
    await expect(personnel).toContainText('Corpus_annote')
    await expect(personnel.locator('.recent-type').first()).toHaveText('Cet ordinateur')
    await expect(personnel.locator('.recent-nom').first()).toHaveCSS('color', 'rgb(28, 92, 51)')
    await expect(page.getByRole('list', { name: 'Copies d’exemples récentes', exact: true })).toHaveCount(0)

    await ongletTravail.focus()
    await page.keyboard.press('ArrowRight')
    await expect(ongletExemples).toBeFocused()
    await expect(ongletExemples).toHaveAttribute('aria-selected', 'true')
    const copies = page.getByRole('list', { name: 'Copies d’exemples récentes', exact: true })
    await expect(copies.locator('.recent')).toHaveCount(1)
    await expect(copies).toContainText('Copie_entretiens_importes')
    await expect(copies.locator('.recent-type')).toHaveText('Exemple')
    await expect(copies.locator('.recent-nom').first()).toHaveCSS('color', 'rgb(23, 93, 158)')
    const entrees = await page.evaluate(() => window.sonal.corpus.recents())
    expect(entrees.find((r) => r.type === 'local' && r.dir === fixture.exemple)).toMatchObject({ exemple: 'synth' })
    expect(entrees.find((r) => r.type === 'local' && r.dir === fixture.homonyme)).not.toHaveProperty('exemple')
    await page.keyboard.press('ArrowLeft')
    await expect(ongletTravail).toHaveAttribute('aria-selected', 'true')

    // Grand écran : récents à gauche, apprentissage à droite, sous les actions.
    const actions = (await page.locator('.actions-corpus').boundingBox())!
    const recentsCadre = (await page.locator('.recents-bloc').boundingBox())!
    const cote = (await page.locator('.decouverte-bloc').boundingBox())!
    expect(recentsCadre.y).toBeGreaterThan(actions.y)
    expect(cote.x).toBeGreaterThan(recentsCadre.x)
    expect(cote.y).toBe(recentsCadre.y)
    const premierRecent = (await personnel.locator('.recent').first().boundingBox())!
    expect(premierRecent.y + premierRecent.height).toBeLessThan(await page.evaluate(() => innerHeight))
    await expect(page.locator('.migration-bloc')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/accueil-deux-colonnes.png' })

    // Fenêtre étroite : tout s'empile, sans défilement horizontal.
    await fenetre.evaluate((w) => w.setContentSize(700, 800))
    await expect.poll(async () => {
      const recents = (await page.locator('.recents-bloc').boundingBox())!
      const apprendre = (await page.locator('.decouverte-bloc').boundingBox())!
      return apprendre.y > recents.y
    }).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await personnel.locator('.recent').first().focus()
    await page.keyboard.press('Tab')
    await expect(personnel.locator('.oubli-recent').first()).toBeFocused()
    await page.screenshot({ path: 'test-results/accueil-etroit.png' })
    await fenetre.evaluate((w) => w.setContentSize(1280, 800))

    await ongletExemples.click()
    await copies.locator('.recent').click()
    await expect(page.locator('.ecran.accueil')).toBeHidden()
    await expect.poll(async () => (await page.evaluate(() => window.sonal.corpus.dossierCourant())).dir).toBe(fixture.exemple)
    await page.locator('.fil .lien-nav').filter({ hasText: 'Accueil' }).click()
    await ongletExemples.click()
    await copies.locator('.oubli-recent').click()
    // Sans copie, les onglets disparaissent et la liste des corpus de travail reste.
    await expect(page.getByRole('tablist')).toHaveCount(0)
    expect(existsSync(join(fixture.exemple, 'corpus.crp'))).toBe(true)
    await expect(personnel.locator('.recent')).toHaveCount(2)
    await personnel.locator('.oubli-recent').first().click()
    await expect(personnel.locator('.recent')).toHaveCount(1)
    await personnel.locator('.oubli-recent').first().click()
    // Plus aucun récent : l'accueil devient la page de bienvenue.
    await expect(page.getByRole('heading', { name: 'Bienvenue dans SonalPi', level: 2 })).toBeVisible()
    expect(existsSync(join(fixture.personnel, 'corpus.crp'))).toBe(true)
    expect(existsSync(join(fixture.homonyme, 'corpus.crp'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('accueil : de nombreux récents et des noms longs restent lisibles, avec une recherche', async () => {
  const fixture = preparer()
  const copies = [fixture.exemple]
  for (let i = 0; i < 5; i++) {
    const dir = join(fixture.racine, `Une_copie_avec_un_nom_tres_long_pour_verifier_la_place_${i}`)
    ecrireSeedDemo(dir)
    const corpus = JSON.parse(readFileSync(join(fixture.exemple, 'corpus.crp'), 'utf8')) as CorpusFichier
    corpus.demo!.id += `-${i}`
    writeFileSync(join(dir, 'corpus.crp'), JSON.stringify(corpus))
    copies.push(dir)
  }
  writeFileSync(join(fixture.profil, 'settings.json'), JSON.stringify({ recents: [fixture.personnel, ...copies, fixture.homonyme] }))
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1024, 768))
    await attendreAccueil(page)
    const personnel = page.getByRole('list', { name: 'Corpus récents', exact: true })
    const recent = (await personnel.locator('.recent').first().boundingBox())!
    expect(recent.y + recent.height).toBeLessThan(await page.evaluate(() => innerHeight))
    await page.getByRole('tab', { name: /Copies d’exemples/ }).click()
    const liste = page.getByRole('list', { name: 'Copies d’exemples récentes', exact: true })
    await expect(liste.locator('.recent')).toHaveCount(6)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

    const recherche = page.getByRole('searchbox', { name: 'Rechercher un corpus' })
    await recherche.fill('place_3')
    await expect(liste.locator('.recent')).toHaveCount(1)
    await recherche.fill('introuvable')
    await expect(page.locator('.recents-bloc')).toContainText('Aucun corpus ne correspond à « introuvable ».')
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
    const fichiers = [fixture.personnel, fixture.homonyme, fixture.exemple].map((dir) => readFileSync(join(dir, 'corpus.crp'), 'utf8'))
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
    expect([fixture.personnel, fixture.homonyme, fixture.exemple].map((dir) => readFileSync(join(dir, 'corpus.crp'), 'utf8'))).toEqual(fichiers)
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
  test(`accueil : une seule sorte de récents (${groupe}) s’affiche sans onglets`, async () => {
    const fixture = preparer()
    writeFileSync(join(fixture.profil, 'settings.json'), JSON.stringify({
      recents: groupe === 'exemples' ? [fixture.exemple] : [fixture.personnel, fixture.homonyme],
    }))
    const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await expect(page.getByRole('tablist')).toHaveCount(0)
      const nom = groupe === 'exemples' ? 'Copies d’exemples récentes' : 'Corpus récents'
      await expect(page.getByRole('list', { name: nom, exact: true }).locator('.recent')).toHaveCount(groupe === 'exemples' ? 1 : 2)
    } finally {
      await app.close()
    }
  })
}

test('accueil : sans récent, la page de bienvenue propose tous les points de départ, sans rubrique de migration', async () => {
  const fixture = preparer(true)
  const app = await lancer(fixture.profil, { preserverSettings: true, executablePath: process.env.ACCUEIL_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await expect(page.getByRole('heading', { name: 'Bienvenue dans SonalPi', level: 2 })).toBeVisible()
    await expect(page.locator('.recents-bloc, .recents')).toHaveCount(0)
    for (const action of ['parcours', 'exemples', 'nouveau-corpus', 'nouveau-corpus-distant', 'ouvrir-corpus', 'distant-corpus', 'documentation', 'faq']) {
      await expect(page.locator(`.carte-demo.${action}`)).toBeEnabled()
    }
    await expect(page.locator('.carte-demo.parcours')).toContainText('Conseillé pour débuter')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/accueil-sans-recents.png' })
    await expect(page.locator('.migration-bloc, .migrer-corpus, .migrer-gitlab')).toHaveCount(0)
    await expect(page.locator('.distant-corpus')).toBeEnabled()
    await page.locator('.distant-corpus').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.modale-distant')).toBeVisible()
  } finally {
    await app.close()
  }
})
