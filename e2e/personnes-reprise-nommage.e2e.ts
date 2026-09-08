import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

test('la reprise au nommage reste annulable et ne copie que les champs choisis', async () => {
  const { app, page } = await ouvrir('sonal-personnes-reprise-nommage-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Marie')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.locuteurs = [{ id: 'marie-source', index: 0, nom: 'Marie Dupont', pseudo: 'Alice', interviewer: true, valeursLoc: {}, personneRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await dialogue.getByRole('radio').check()
    await dialogue.locator('summary').click()
    await expect(dialogue.getByRole('checkbox', { name: /^Pseudonyme/ })).toBeChecked()
    await expect(dialogue.getByRole('checkbox', { name: /^Interviewer/ })).not.toBeChecked()
    await dialogue.getByRole('checkbox', { name: 'Ne reprendre aucune donnée' }).check()
    await dialogue.locator('summary').click()
    const avant = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(avant.personnes).toHaveLength(0)
    await expect(dialogue).toContainText('Aucune donnée ne sera reprise.')
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await page.locator('.barre .retour').click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const source = vue.locuteurs.find((l: any) => l.locuteurId === 'marie-source')
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Marie Dupont' && l.locuteurId !== 'marie-source')
    expect(cible.personneRef).toBe(source.personneRef)
    expect(cible.pseudo).not.toBe('Alice')
    expect(cible.interviewer).toBe(false)
  } finally { await app.close() }
})
