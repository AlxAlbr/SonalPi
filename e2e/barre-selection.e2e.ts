import { expect, test, type Page } from '@playwright/test'
import { coderTheme, ouvrir } from './util'

/** Sélectionne un mot avec un vrai double-clic, comme le ferait un utilisateur. */
async function selectionnerMot(page: Page, mot: string) {
  const centre = await page.evaluate((recherche) => {
    const editeur = document.querySelector('.editeur')!
    const parcours = document.createTreeWalker(editeur, NodeFilter.SHOW_TEXT)
    while (parcours.nextNode()) {
      const indice = parcours.currentNode.textContent!.indexOf(recherche)
      if (indice < 0) continue
      const plage = document.createRange()
      plage.setStart(parcours.currentNode, indice)
      plage.setEnd(parcours.currentNode, indice + recherche.length)
      const rect = plage.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    }
    throw new Error(`mot introuvable : ${recherche}`)
  }, mot)
  await page.mouse.dblclick(centre.x, centre.y)
}

test('sélectionner du texte ne fait pas apparaître de barre flottante', async () => {
  const { app, page } = await ouvrir('sonal-selection-sans-barre-')
  try {
    await selectionnerMot(page, 'Lyon')
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('Lyon')
    await expect(page.getByRole('toolbar', { name: 'Actions sur la sélection' })).toHaveCount(0)
    await expect(page.locator('.barre-selection, .voile-selection')).toHaveCount(0)

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowLeft')
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().length ?? 0)).toBe(1)
    await expect(page.getByRole('toolbar', { name: 'Actions sur la sélection' })).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('les panneaux et le clic droit restent utilisables sur le texte sélectionné', async () => {
  const { app, page } = await ouvrir('sonal-selection-panneaux-')
  try {
    await selectionnerMot(page, 'Lyon')
    await coderTheme(page, 'Lieu')
    await expect(page.locator('.editeur .annot')).toHaveText('Lyon')

    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await selectionnerMot(page, 'Lyon')
    await page.locator('.boutons-loc').getByRole('button', { name: 'Karine', exact: true }).click()
    await expect(page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })).toHaveCount(1)

    await page.locator('.editeur .annot', { hasText: 'Lyon' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: /Commenter/ }).click()
    await expect(page.locator('[data-test="modale-commentaire"]')).toBeVisible()
  } finally {
    await app.close()
  }
})
