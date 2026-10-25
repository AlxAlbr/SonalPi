import { test, expect } from '@playwright/test'
import { ouvrir, coderTheme, ouvrirAnalyse } from './util'

test('calcule les extraits après une sélection modifiée dans l’espace d’analyse', async () => {
  const { app, page } = await ouvrir()
  const editeur = page.locator('.editeur')

  await editeur.click()
  await editeur.press('ControlOrMeta+a')
  await coderTheme(page, 'Famille')
  await expect.poll(() => editeur.locator('.annot').count()).toBeGreaterThan(0)

  await ouvrirAnalyse(page, 'synthese')
  const cote = page.locator('.espace-analyse .cote-synthese')
  await cote.getByRole('tab', { name: /^Entretiens/ }).click()
  const entretiens = cote.locator('[role="tabpanel"] .choix input')
  expect(await entretiens.count()).toBeGreaterThan(0)
  for (let index = 0; index < await entretiens.count(); index++) await expect(entretiens.nth(index)).toBeChecked()
  await cote.getByRole('tab', { name: /^Thèmes/ }).click()
  const choixFamille = cote.locator('label').filter({ hasText: 'Famille' })
  await choixFamille.locator('input').check()
  await page.getByRole('button', { name: 'Calculer' }).click()

  await expect(page.locator('.espace-analyse .panneau-synthese .bilan'))
    .toContainText(/1 entretien\(s\) · [1-9]\d* extrait\(s\)/)
  await app.close()
})
