import { expect, test, type Page } from '@playwright/test'
import { entrerEntretien, ouvrirSurCorpus, selectionner } from './util'

async function ouvrirAjoutRecueil(page: Page) {
  await selectionner(page, 'Karine habite Lyon')
  const centre = await page.evaluate(() => {
    const plage = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { x: plage.x + plage.width / 2, y: plage.y + plage.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
  await page.getByRole('menuitem', { name: /recueil/ }).click()
  return page.getByRole('dialog', { name: 'Ajouter à un recueil', exact: true })
}

test('créer un recueil depuis un passage : annulation sans écriture, focus et sélection conservés', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-ajout-cible-')
  try {
    await entrerEntretien(page)
    await page.setViewportSize({ width: 760, height: 700 })
    const avant = await page.evaluate(async () => ({
      source: await window.sonal.corpus.lireEntretien('e1'),
      recueils: (await window.sonal.corpus.ouvrir()).recueils,
    }))
    let dialogue = await ouvrirAjoutRecueil(page)
    await dialogue.getByLabel('Nom du nouveau recueil').fill('Brouillon annulé')
    await dialogue.press('Tab')
    expect(await dialogue.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await dialogue.press('Escape')
    await expect(dialogue).toHaveCount(0)
    await expect(page.locator('.editeur')).toBeFocused()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Karine habite Lyon')
    const apres = await page.evaluate(async () => ({
      source: await window.sonal.corpus.lireEntretien('e1'),
      recueils: (await window.sonal.corpus.ouvrir()).recueils,
    }))
    expect(apres).toEqual(avant)
    dialogue = await ouvrirAjoutRecueil(page)
    await dialogue.getByLabel('Nom du nouveau recueil').fill('Citations du terrain')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await dialogue.getByRole('button', { name: 'Ajouter le passage', exact: true }).click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await expect(page.locator('.editeur')).toBeFocused()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Karine habite Lyon')
    await page.getByRole('button', { name: 'Ouvrir le recueil « Citations du terrain »', exact: true }).click()
    await expect(page.locator('.recueils-corpus .nom-recueil')).toHaveValue('Citations du terrain')
    await expect(page.locator('.passage blockquote')).toHaveText('Karine habite Lyon')
    const recueils = await page.evaluate(async () => (await window.sonal.corpus.ouvrir()).recueils)
    expect(Object.values(recueils ?? {})).toHaveLength(1)
    expect(Object.values(recueils ?? {})[0].items).toHaveLength(1)
  } finally {
    await app.close()
  }
})
