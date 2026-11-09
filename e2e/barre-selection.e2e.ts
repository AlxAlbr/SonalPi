import { expect, test, type Page } from '@playwright/test'
import { ouvrir } from './util'

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

const barre = (page: Page) => page.getByRole('toolbar', { name: 'Actions sur la sélection' })

/** À la fermeture des fenêtres Cas et Recueil, l'application remet le passage en sélection.
 *  L'attente évite qu'un nouveau double-clic au même endroit compte comme un triple-clic. */
async function attendreRetourSelection(page: Page) {
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('Lyon')
  await page.waitForTimeout(700)
}

test('la barre apparaît à la fin d’une sélection et disparaît avec elle', async () => {
  const { app, page } = await ouvrir('sonal-barre-selection-')
  try {
    await expect(barre(page)).toBeHidden()
    await page.locator('.editeur p').first().click({ position: { x: 30, y: 10 } })
    await expect(barre(page)).toBeHidden()

    await selectionnerMot(page, 'Lyon')
    await expect(barre(page)).toBeVisible()
    for (const nom of ['Commenter', 'Assigner un locuteur', 'Pseudonymiser', 'Assigner une thématique', 'Ajouter à un cas', 'Ajouter à un recueil']) {
      await expect(barre(page).getByRole('button', { name: nom, exact: true })).toBeVisible()
    }
    const positions = await page.evaluate(() => ({
      barre: document.querySelector('.barre-selection')!.getBoundingClientRect().bottom,
      selection: window.getSelection()!.getRangeAt(0).getBoundingClientRect().top,
    }))
    expect(positions.barre).toBeLessThanOrEqual(positions.selection)

    await page.keyboard.press('Escape')
    await expect(barre(page)).toBeHidden()

    await selectionnerMot(page, 'Lyon')
    await expect(barre(page)).toBeVisible()
    await page.locator('.colonne-gauche .onglets').click({ position: { x: 5, y: 5 } })
    await expect(barre(page)).toBeHidden()
  } finally {
    await app.close()
  }
})

test('assigner une thématique ou un locuteur passe par une fenêtre de choix', async () => {
  const { app, page } = await ouvrir('sonal-barre-selection-choix-')
  try {
    await selectionnerMot(page, 'Lyon')
    await barre(page).getByRole('button', { name: 'Assigner une thématique', exact: true }).click()
    let fenetre = page.getByRole('dialog', { name: 'Assigner une thématique' })
    await expect(fenetre.getByRole('button', { name: 'Lieu' })).toBeVisible()
    await fenetre.getByRole('button', { name: 'Lieu' }).click()
    await expect(fenetre).toHaveCount(0)
    await expect(page.locator('.editeur .annot')).toHaveText('Lyon')

    await selectionnerMot(page, 'Lyon')
    await barre(page).getByRole('button', { name: 'Assigner un locuteur', exact: true }).click()
    fenetre = page.getByRole('dialog', { name: 'Assigner un locuteur' })
    await expect(fenetre.getByRole('button', { name: 'aucun', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(fenetre).toHaveCount(0)
    await expect(barre(page)).toBeVisible()

    await barre(page).getByRole('button', { name: 'Assigner un locuteur', exact: true }).click()
    await fenetre.getByRole('button', { name: 'Karine', exact: true }).click()
    await expect(page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })).toHaveCount(1)
  } finally {
    await app.close()
  }
})

test('les autres actions ouvrent le commentaire, la pseudonymisation, les cas et les recueils', async () => {
  const { app, page } = await ouvrir('sonal-barre-selection-actions-')
  try {
    await selectionnerMot(page, 'Lyon')
    await barre(page).getByRole('button', { name: 'Commenter', exact: true }).click()
    await expect(page.locator('[data-test="modale-commentaire"]')).toBeVisible()
    await page.locator('.voile').filter({ has: page.locator('[data-test="modale-commentaire"]') }).click({ position: { x: 5, y: 5 } })
    await expect(page.locator('[data-test="modale-commentaire"]')).toHaveCount(0)

    await selectionnerMot(page, 'Lyon')
    await barre(page).getByRole('button', { name: 'Ajouter à un cas', exact: true }).click()
    const cas = page.getByRole('dialog', { name: 'Ajouter à un cas', exact: true })
    await expect(cas).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cas).toHaveCount(0)
    await attendreRetourSelection(page)

    await selectionnerMot(page, 'Lyon')
    await barre(page).getByRole('button', { name: 'Ajouter à un recueil', exact: true }).click()
    const recueil = page.getByRole('dialog', { name: 'Ajouter à un recueil', exact: true })
    await expect(recueil).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(recueil).toHaveCount(0)
    await attendreRetourSelection(page)

    await selectionnerMot(page, 'Lyon')
    await barre(page).getByRole('button', { name: 'Pseudonymiser', exact: true }).click()
    await expect(page.locator('.onglets button[data-onglet="anon"]')).toHaveClass(/actif/)
    await expect(page.locator('.saisie-anon .nom-saisie').first()).toHaveValue('Lyon')
    await expect(page.locator('.saisie-anon .pseudo-anon').first()).toBeFocused()
    await expect(barre(page)).toBeHidden()
  } finally {
    await app.close()
  }
})
