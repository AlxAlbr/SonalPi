import { test, expect } from '@playwright/test'
import { ouvrir, retourCorpus } from './util'

test('le nommage crée une identité distincte puis les changements de nom s’enregistrent directement pour un seul entretien', async () => {
  const { app, page } = await ouvrir('sonal-personnes-nommage-')
  try {
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont'); await nom.press('Enter')
    const confirmation = page.getByRole('status').filter({ hasText: 'Locuteur « Marie Dupont » créé' })
    await expect(confirmation).toBeVisible(); await expect(confirmation).toHaveCSS('font-size', '14px')
    const avant = await page.evaluate(() => window.sonal.corpus.personnesInventaire())
    const cible = avant.participations.find((p) => p.entretienId === 'e1' && p.nom === 'Marie Dupont')!
    expect(avant.locuteurs).toHaveLength(1); expect(cible.locuteurRef).toBe(avant.locuteurs[0].id)
    await nom.fill('Mme Dupont'); await nom.press('Enter')
    const dialogue = page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })
    await expect(nom).toHaveValue('Mme Dupont'); await expect(nom).toBeEnabled()
    await expect(dialogue).toHaveCount(0)
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click(); await retourCorpus(page)
    const apres = await page.evaluate(() => window.sonal.corpus.personnesInventaire())
    expect(apres.locuteurs).toEqual([{ id: avant.locuteurs[0].id, nom: 'Mme Dupont' }])
    expect(apres.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)).toEqual({ ...cible, nom: 'Mme Dupont' })
  } finally { await app.close() }
})
