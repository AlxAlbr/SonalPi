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

test('le passage résume ses cas et les occurrences multiples de ses recueils', async () => {
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
    const resume = page.locator('.resume-associations')
    const sectionEntretien = page.locator('.section-texte-entretien')
    await expect(sectionEntretien).toBeVisible()
    expect(await resume.evaluate((el) => !!el.previousElementSibling?.classList.contains('section-texte-entretien'))).toBe(true)
    await expect.poll(() => sectionEntretien.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto')
    await expect(resume.locator('summary').first()).toContainText('1 cas · 1 recueil')
    await resume.locator('summary').first().click()
    await expect(resume).toContainText('Portrait de Karine')
    await expect(resume).toContainText('Ajout manuel')
    await expect(resume).toContainText('Citations terrain · 2 occurrences')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await resume.locator('.choix-occurrences > summary').click()
    await resume.getByRole('button', { name: /Ouvrir l’occurrence 2/ }).click()

    const recueil = page.locator('.recueils-corpus')
    await expect(recueil.getByLabel('Nom du recueil')).toHaveValue('Citations terrain')
    await expect(recueil.locator('[data-recueil-item]:focus blockquote')).toHaveText('Karine habite Lyon')
    await page.getByRole('button', { name: /Revenir au passage/ }).click()
    await expect(page.locator('.editeur')).toBeFocused()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('Karine habite Lyon')

    await page.getByRole('button', { name: 'Analyser et interpréter', exact: true }).click()
    await page.keyboard.press('Control+f')
    await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
    await expect(page.locator('.barre-recherche')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
