import { test, expect } from '@playwright/test'
import { ouvrir, retourCorpus } from './util'

test('nommage lié : Plus tard conserve le lien, déplacer change seulement l’identité', async () => {
  const { app, page } = await ouvrir('sonal-personnes-deplacement-')
  try {
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const gestion = page.getByRole('dialog', { name: 'Gestion des locuteurs', exact: true })
    await expect(gestion).toBeVisible()
    const nom = gestion.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    await expect(page.getByRole('status').filter({ hasText: 'Personne « Marie Dupont » créée' })).toBeVisible()
    const sourceId = await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Autre identité')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.participations = [{ id: 'paul-source', index: 0, nom: 'Paul Martin', valeursLoc: {}, locuteurRef: null }]
      await api.ecrireEntretien(id, payload)
      return api.personnesCommander({ type: 'creer', entretienId: id, participationId: 'paul-source', nom: 'Paul Martin' })
    })
    await nom.fill('Paul Martin')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('button', { name: 'Plus tard' }).click()
    const apresReport = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(apresReport.participations.find((l: any) => l.nom === 'Paul Martin' && l.participationId !== 'paul-source').locuteurRef).not.toBe(sourceId)
    await nom.fill('PAUL MARTIN')
    await nom.press('Tab')
    await expect(dialogue).toBeVisible()
    await dialogue.getByRole('radio').check()
    await expect(dialogue).toContainText('à la place de « Marie Dupont »')
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await gestion.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await retourCorpus(page)
    const apres = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(apres.participations.find((l: any) => l.nom === 'PAUL MARTIN').locuteurRef).toBe(sourceId)
    expect(apres.locuteurs.map((p: any) => p.nom).sort()).toEqual(['Marie Dupont', 'Paul Martin'])
  } finally { await app.close() }
})
