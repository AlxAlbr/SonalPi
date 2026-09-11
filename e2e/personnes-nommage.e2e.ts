import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

test('un nom spécifique crée une personne sans recopier le rôle ni renommer son identité ensuite', async () => {
  const { app, page } = await ouvrir('sonal-personnes-nommage-')
  try {
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const confirmationCreation = page.getByRole('status').filter({ hasText: 'Personne « Marie Dupont » créée' })
    await expect(confirmationCreation).toBeVisible()
    await expect(confirmationCreation).toHaveCSS('font-size', '12px')
    const avant = await page.evaluate(async () => {
      const vue = await (window as any).sonal.corpus.personnesInventaire()
      return { personnes: vue.personnes, locuteur: vue.locuteurs.find((l: any) => l.nom === 'Marie Dupont') }
    })
    expect(avant.personnes).toHaveLength(1)
    expect(avant.locuteur.personneRef).toBe(avant.personnes[0].id)
    await nom.fill('Mme Dupont')
    await nom.press('Tab')
    await page.locator('.barre .retour').click()
    const apres = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(apres.personnes).toEqual(avant.personnes)
    expect(apres.locuteurs.find((l: any) => l.nom === 'Mme Dupont').personneRef).toBe(avant.personnes[0].id)
  } finally {
    await app.close()
  }
})
