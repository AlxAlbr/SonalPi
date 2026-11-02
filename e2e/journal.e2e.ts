import { test, expect, type Page } from '@playwright/test'
import { ouvrir, coderTheme, selectionner } from './util'

/**
 *  Journal d'actions (actions de modèle seules ; volatil, jamais persisté).
 *  (1) coder 3 passages, annuler le 1er → les 2 autres intacts ;
 *  (2) annuler une attribution de locuteur → l'ancien loc restauré (la scission
 *  demeure — jamais de fusion) ; (3) une entrée dont la cible a disparu est grisée.
 */

async function ongletJournal(page: Page) {
  await page.locator('[data-onglet="journal"]').click()
}

/** Code la 1re occurrence de `mot` avec `theme` (sélection réelle + clic-thème S3). */
async function coder(page: Page, mot: string, theme: string) {
  await selectionner(page, mot)
  await coderTheme(page, theme)
}

test('coder 3 passages, annuler le 1er → les 2 autres intacts', async () => {
  const { app, page } = await ouvrir('sonal-journal-')
  const ed = page.locator('.editeur')

  await coder(page, 'Karine', 'Famille')
  await coder(page, 'Lyon', 'Lieu')
  await coder(page, 'retraite', 'Travail')
  await expect(ed.locator('.annot')).toHaveCount(3)

  // Journal : 3 entrées, la plus ancienne (1er codage) en DERNIER.
  await ongletJournal(page)
  const entrees = page.locator('.liste-journal li')
  await expect(entrees).toHaveCount(3)
  await expect(entrees.last()).toContainText('Codage posé : Famille')
  await entrees.last().locator('.annuler-entree').click()

  // Le 1er codage est annulé, les 2 autres sont INTACTS.
  await expect(ed.locator('.annot')).toHaveCount(2)
  await expect(ed.locator('.annot', { hasText: 'Karine' })).toHaveCount(0)
  await expect(ed.locator('.annot', { hasText: 'Lyon' })).toHaveCount(1)
  await expect(ed.locator('.annot', { hasText: 'retraite' })).toHaveCount(1)
  await expect(page.locator('.liste-journal li')).toHaveCount(2) // l'entrée est sortie
  await app.close()
})

test('annuler une attribution de locuteur → l’ancien loc restauré, la scission demeure', async () => {
  const { app, page } = await ouvrir('sonal-journal-')

  // Attribuer « Lyon » (sous-partie du bloc 1, loc 1) à Karine → scission, loc 2.
  await selectionner(page, 'Lyon')
  await page.locator('[data-onglet="locuteurs"]').click()
  await expect(page.locator('.attribuer .lbl')).toHaveText('Attribuer le bloc courant ou la sélection :')
  await page.locator('.boutons-loc .attr', { hasText: 'Karine' }).click()
  await expect(page.locator('.editeur p')).toHaveCount(4)
  await expect(page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })).toHaveCount(1)

  // Journal → annuler l'attribution.
  await ongletJournal(page)
  const entree = page.locator('.liste-journal li', { hasText: 'Locuteur attribué : Karine' })
  await entree.locator('.annuler-entree').click()

  // L'ancien loc est restauré ; les 4 blocs restent (aucune fusion).
  await expect(page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })).toHaveCount(0)
  await expect(page.locator('.editeur p')).toHaveCount(4)
  await app.close()
})

test('une entrée dont la cible a disparu est grisée (non annulable)', async () => {
  const { app, page } = await ouvrir('sonal-journal-')
  const ed = page.locator('.editeur')

  // Coder puis retirer (toggle S3) : l'annotation du « posé » n'existe plus.
  await coder(page, 'Karine', 'Famille')
  await coder(page, 'Karine', 'Famille')
  await expect(ed.locator('.annot')).toHaveCount(0)

  await ongletJournal(page)
  const entrees = page.locator('.liste-journal li')
  await expect(entrees).toHaveCount(2)
  // « Codage posé » (le plus ancien) : sa cible a disparu → grisé, bouton désactivé.
  const posee = entrees.last()
  await expect(posee).toContainText('Codage posé')
  await expect(posee).toHaveClass(/grisee/)
  await expect(posee.locator('.annuler-entree')).toBeDisabled()
  // « Codage retiré » : annulable → l'annuler re-pose le codage.
  await entrees.first().locator('.annuler-entree').click()
  await expect(ed.locator('.annot')).toHaveText('Karine')
  await app.close()
})
