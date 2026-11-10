import { test, expect, type Locator, type Page } from '@playwright/test'
import { ouvrir, selectionner } from './util'

async function glisserOnglet(page: Page, onglet: Locator, cible: () => Locator) {
  const rect = (await onglet.boundingBox())!
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 12, { steps: 3 })
  await expect(page.locator('.apercu-onglet')).toBeVisible()
  const depot = (await cible().boundingBox())!
  await page.mouse.move(depot.x + depot.width / 2, depot.y + depot.height / 2, { steps: 12 })
  await expect(cible()).toHaveClass(/depot-actif/)
  await page.mouse.up()
  await expect(page.locator('.apercu-onglet')).toHaveCount(0)
}

test('Comments descend sous Locuteurs, reste utilisable, puis rejoint les onglets du haut', async () => {
  const { app, page } = await ouvrir('sonal-panneaux-glissement-')
  try {
    const erreurs: string[] = []
    page.on('pageerror', (erreur) => erreurs.push(erreur.message))
    const haut = page.locator('[data-zone="haut"]')
    const bas = page.locator('[data-zone="bas"]')
    const locuteurs = page.locator('.colonne-gauche .locuteurs-coder')
    await locuteurs.locator('.statistiques-locuteurs > summary').click()
    await locuteurs.evaluate((el) => { (el as HTMLElement).dataset.temoin = 'conserve' })
    const commentaires = page.locator('[data-onglet="commentaires"]')
    await glisserOnglet(page, commentaires, () => page.locator('.zone-depot-bas'))
    await expect(haut.locator('.locuteurs-coder')).toBeVisible()
    await expect(bas.locator('.panneau.commentaires')).toBeVisible()
    await expect(locuteurs).toHaveAttribute('data-temoin', 'conserve')
    await expect(locuteurs.locator('.statistiques-locuteurs')).toHaveAttribute('open', '')
    await expect(page.locator('.colonne-gauche .zone-defilement')).toHaveCount(2)

    const avant = (await haut.boundingBox())!.height
    const separation = page.getByRole('separator', { name: 'Hauteur des panneaux de gauche' })
    const rect = (await separation.boundingBox())!
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await page.mouse.down()
    await page.mouse.move(rect.x + rect.width / 2, rect.y + 60, { steps: 8 })
    await page.mouse.up()
    expect((await haut.boundingBox())!.height).toBeGreaterThan(avant + 20)
    const hauteurFenetre = await page.evaluate(() => window.innerHeight)
    const rectBas = (await bas.boundingBox())!
    expect(rectBas.y + rectBas.height).toBeLessThanOrEqual(hauteurFenetre)

    await selectionner(page, 'retraite')
    await bas.getByRole('button', { name: 'Commentaire', exact: true }).click()
    await page.locator('[data-test="commentaire-texte"]').fill('Commentaire depuis le panneau du bas')
    await page.locator('[data-test="commentaire-valider"]').click()
    await expect(bas.locator('.texte-commentaire')).toHaveText('Commentaire depuis le panneau du bas')
    await expect(haut.locator('.locuteurs-coder')).toBeVisible()

    await glisserOnglet(page, bas.locator('[data-onglet="commentaires"]'), () => haut)
    await expect(bas).toHaveCount(0)
    await expect(haut.locator('.panneau.commentaires')).toBeVisible()
    await expect(page.locator('.colonne-gauche [data-onglet]')).toHaveCount(4)
    await page.locator('[data-onglet="locuteurs"]').click()
    await expect(locuteurs).toHaveAttribute('data-temoin', 'conserve')
    await expect(locuteurs.locator('.statistiques-locuteurs')).toHaveAttribute('open', '')
    expect(erreurs).toEqual([])
  } finally {
    await app.close()
  }
})

test('Échap et un dépôt hors du panneau annulent le glissement sans changer d’outil', async () => {
  const { app, page } = await ouvrir('sonal-panneaux-annulation-')
  try {
    for (const annulation of ['clavier', 'hors-panneau']) {
      await page.locator('.editeur').click()
      const onglet = page.locator('[data-onglet="commentaires"]')
      const rect = (await onglet.boundingBox())!
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2 + 12, { steps: 3 })
      await expect(page.locator('.apercu-onglet')).toBeVisible()
      if (annulation === 'clavier') await page.keyboard.press('Escape')
      else await page.mouse.move(1000, 400, { steps: 8 })
      await page.mouse.up()
      await expect(page.locator('.apercu-onglet')).toHaveCount(0)
      await expect(page.locator('[data-zone="bas"]')).toHaveCount(0)
      await expect(page.locator('[data-onglet="locuteurs"]')).toHaveClass(/actif/)
    }
  } finally {
    await app.close()
  }
})

test('les déplacements au clavier conservent la saisie des pseudos et permettent de tout regrouper', async () => {
  const { app, page } = await ouvrir('sonal-panneaux-clavier-')
  try {
    const erreurs: string[] = []
    page.on('pageerror', (erreur) => erreurs.push(erreur.message))
    const onglet = page.locator('[data-onglet="anon"]')
    await onglet.click()
    const nom = page.locator('.saisie-anon .nom-saisie').first()
    await page.getByTitle('Ajouter une ligne de saisie', { exact: true }).click()
    await expect(page.locator('.saisie-anon')).toHaveCount(3)
    await nom.fill('Nom à compléter')
    await nom.evaluate((el) => { (el as HTMLElement).dataset.temoin = 'meme-champ' })
    await onglet.press('Alt+ArrowDown')
    await expect(page.locator('[data-zone="bas"] .saisie-anon').first()).toBeVisible()
    await expect(page.locator('.ligne-anon').filter({ hasText: 'Nom à compléter' })).toBeVisible()
    await expect(page.locator('.saisie-anon')).toHaveCount(3)
    await expect(nom).toHaveAttribute('data-temoin', 'meme-champ')
    await expect(onglet).toBeFocused()
    const haut = page.locator('[data-zone="haut"] .zone-defilement')
    const bas = page.locator('[data-zone="bas"] .zone-defilement')
    await page.getByTitle('Ajouter une ligne de saisie', { exact: true }).evaluate((el) => {
      for (let i = 0; i < 15; i++) (el as HTMLButtonElement).click()
    })
    const hautAvant = await haut.evaluate((el) => el.scrollTop)
    await bas.evaluate((el) => { el.scrollTop = el.scrollHeight })
    expect(await bas.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await haut.evaluate((el) => el.scrollTop)).toBe(hautAvant)
    await expect(page.locator('.saisie-anon')).toHaveCount(18)

    const separation = page.getByRole('separator', { name: 'Hauteur des panneaux de gauche' })
    await separation.press('ArrowDown')
    await expect(separation).toHaveAttribute('aria-valuenow', '55')
    await separation.press('Home')
    await expect(separation).toHaveAttribute('aria-valuenow', '20')
    await separation.press('End')
    await expect(separation).toHaveAttribute('aria-valuenow', '80')

    await page.locator('[data-onglet="commentaires"]').press('Alt+ArrowDown')
    await expect(page.locator('[data-zone="bas"] [data-onglet]')).toHaveCount(2)
    await page.getByRole('button', { name: 'Regrouper les onglets en haut' }).click()
    await expect(page.locator('[data-zone="bas"]')).toHaveCount(0)
    await onglet.click()
    await expect(page.locator('.ligne-anon').filter({ hasText: 'Nom à compléter' })).toBeVisible()
    await expect(page.locator('.saisie-anon')).toHaveCount(18)
    await expect(nom).toHaveAttribute('data-temoin', 'meme-champ')
    await expect(page.locator('.colonne-gauche .zone-defilement')).toHaveCount(1)
    expect(erreurs).toEqual([])
  } finally {
    await app.close()
  }
})
