import { expect, test, type Page } from '@playwright/test'
import { entrerEntretien, ouvrirSurCorpus, selectionner } from './util'

async function ouvrirMenuSelection(page: Page, phrase: string) {
  await selectionner(page, phrase)
  const centre = await page.evaluate(() => {
    const plage = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { x: plage.x + plage.width / 2, y: plage.y + plage.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
}

test('les associations du passage ne sont plus affichées dans l’entretien', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-associations-passage-')
  try {
    await entrerEntretien(page)
    await page.setViewportSize({ width: 760, height: 700 })
    await ouvrirMenuSelection(page, 'Karine habite Lyon')
    await page.getByRole('menuitem', { name: /Associer à un cas/ }).click()
    let dialogue = page.getByRole('dialog', { name: 'Ajouter à un cas', exact: true })
    await dialogue.getByRole('button', { name: 'Créer un nouveau cas', exact: true }).click()
    await dialogue.getByLabel('Nom du nouveau cas *').fill('Portrait de Karine')
    await dialogue.getByRole('button', { name: 'Créer et associer', exact: true }).click()
    await page.getByRole('button', { name: 'Fermer la confirmation' }).click()

    await ouvrirMenuSelection(page, 'Karine habite Lyon')
    await page.getByRole('menuitem', { name: /Ajouter au recueil/ }).click()
    dialogue = page.getByRole('dialog', { name: 'Ajouter à un recueil', exact: true })
    await dialogue.getByLabel('Nom du nouveau recueil').fill('Citations terrain')
    await dialogue.getByRole('button', { name: 'Ajouter le passage', exact: true }).click()
    await page.getByRole('button', { name: 'Fermer la confirmation' }).click()

    await ouvrirMenuSelection(page, 'Karine habite Lyon')
    await page.getByRole('menuitem', { name: /Ajouter au recueil/ }).click()
    dialogue = page.getByRole('dialog', { name: 'Ajouter à un recueil', exact: true })
    await dialogue.getByRole('checkbox', { name: 'Créer un nouveau recueil' }).uncheck()
    await dialogue.getByRole('combobox').first().selectOption({ label: 'Citations terrain' })
    await dialogue.getByRole('button', { name: 'Ajouter le passage', exact: true }).click()
    await page.getByRole('button', { name: 'Fermer la confirmation' }).click()

    await selectionner(page, 'Karine habite Lyon')
    await expect(page.locator('.resume-associations')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  } finally {
    await app.close()
  }
})
