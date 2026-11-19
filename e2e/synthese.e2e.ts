import { test, expect } from '@playwright/test'
import { ouvrir, coderTheme, ouvrirAnalyse, retourCorpus } from './util'

test('calcule les extraits après une sélection modifiée dans l’espace d’analyse', async () => {
  const { app, page } = await ouvrir()
  try {
    const editeur = page.locator('.editeur')
    await editeur.click()
    await editeur.press('ControlOrMeta+a')
    await coderTheme(page, 'Famille')
    await expect.poll(() => editeur.locator('.annot').count()).toBeGreaterThan(0)
    await retourCorpus(page)

    await page.evaluate(async () => {
      const inventaire = await window.sonal.corpus.personnesInventaire()
      const participation = inventaire.participations.find((p) => p.nom === 'Karine')
      if (!participation) throw new Error('Participation de Karine absente du corpus de test.')
      await window.sonal.corpus.personnesCommander({
        type: 'creer', entretienId: participation.entretienId, participationId: participation.participationId,
        nom: 'Identité corpus de Karine',
      })
    })

    await ouvrirAnalyse(page, 'synthese')
    const cote = page.locator('.espace-analyse .cote-synthese')
    const panneau = page.locator('.espace-analyse .panneau-synthese')
    await cote.getByRole('tab', { name: /^Entretiens/ }).click()
    const entretiens = cote.locator('[role="tabpanel"] .choix input')
    expect(await entretiens.count()).toBeGreaterThan(0)
    for (let index = 0; index < await entretiens.count(); index++) await expect(entretiens.nth(index)).toBeChecked()
    await cote.getByRole('tab', { name: /^Thèmes/ }).click()
    await cote.locator('label').filter({ hasText: 'Famille' }).locator('input').check()
    await panneau.getByRole('button', { name: 'Calculer la synthèse', exact: true }).click()
    await expect(panneau.locator('.bilan')).toContainText(/1 entretien\(s\) · [1-9]\d* extrait\(s\)/)

    await cote.getByRole('tab', { name: /^Locuteurs/ }).click()
    await cote.getByRole('checkbox', { name: 'Identité corpus de Karine', exact: true }).check()
    await expect(panneau).toContainText('Le résultat précédent reste visible')
    await panneau.getByRole('button', { name: 'Actualiser la synthèse', exact: true }).click()
    await expect(panneau.locator('.bilan')).toContainText('1 entretien(s) · 1 extrait(s)')
    await panneau.getByText('Détail des critères', { exact: true }).click()
    await expect(panneau.locator('.bilan')).toContainText('Locuteurs : Identité corpus de Karine')
    await expect(cote.getByRole('checkbox', { name: 'Locuteurs non associés', exact: true })).not.toBeChecked()
    await expect(cote.getByRole('checkbox', { name: 'Passages sans locuteur', exact: true })).not.toBeChecked()
  } finally {
    await app.close()
  }
})
