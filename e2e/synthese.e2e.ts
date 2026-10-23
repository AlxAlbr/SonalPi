import { test, expect } from '@playwright/test'
import { ouvrir, coderTheme } from './util'

test('calcule les extraits après une sélection modifiée dans la fenêtre', async () => {
  const { app, page } = await ouvrir()
  const editeur = page.locator('.editeur')

  await editeur.click()
  await editeur.press('ControlOrMeta+a')
  await coderTheme(page, 'Famille')
  await expect.poll(() => editeur.locator('.annot').count()).toBeGreaterThan(0)

  await page.locator('.btn-synthese').click()
  await page.getByRole('tab', { name: /^Entretiens/ }).click()
  const entretiens = page.locator('.fenetre .filtres [role="tabpanel"] .choix input')
  expect(await entretiens.count()).toBeGreaterThan(0)
  for (let index = 0; index < await entretiens.count(); index++) await expect(entretiens.nth(index)).toBeChecked()
  await page.getByRole('tab', { name: /^Thèmes/ }).click()
  const choixFamille = page.locator('.filtres label').filter({ hasText: 'Famille' })
  await choixFamille.locator('input').check()
  await page.getByRole('button', { name: 'Calculer' }).click()

  await expect(page.locator('.fenetre > .bilan')).toContainText(/1 entretien\(s\) · [1-9]\d* extrait\(s\)/)
  await app.close()
})
