import { test, expect } from '@playwright/test'
import { ouvrir, ouvrirGestionLocuteurs } from './util'

test('nommage lié : Plus tard conserve le lien, déplacer change seulement l’identité', async () => {
  const { app, page } = await ouvrir('sonal-personnes-deplacement-')
  try {
    await page.locator('[data-onglet="themes"]').click()
    await ouvrirGestionLocuteurs(page)
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    await expect(page.getByRole('status').filter({ hasText: 'Personne « Marie Dupont » créée' })).toBeVisible()
    const sourceId = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Autre identité')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs = [{ id: 'paul-source', index: 0, nom: 'Paul Martin', valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
      return api.personnesCommander({ type: 'creer', entretienId: id, locuteurId: 'paul-source', nom: 'Paul Martin' })
    })
    await nom.fill('Paul Martin')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('button', { name: 'Plus tard' }).click()
    const apresReport = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(apresReport.locuteurs.find((l: any) => l.nom === 'Paul Martin' && l.locuteurId !== 'paul-source').personneRef).not.toBe(sourceId)
    await nom.fill('PAUL MARTIN')
    await nom.press('Tab')
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('radio').check()
    await expect(dialogue).toContainText('à la place de « Marie Dupont »')
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    const apres = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(apres.locuteurs.find((l: any) => l.nom === 'PAUL MARTIN').personneRef).toBe(sourceId)
    expect(apres.personnes.map((p: any) => p.nom).sort()).toEqual(['Marie Dupont', 'Paul Martin'])
  } finally { await app.close() }
})
