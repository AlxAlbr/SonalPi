import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

test('le nommage propose une identité et lie sans écraser la session', async () => {
  const { app, page } = await ouvrir('sonal-personnes-dialogue-')
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
    await expect(dialogue).toBeVisible()
    await expect(dialogue.getByRole('button', { name: 'Plus tard' })).toBeFocused()
    await expect(dialogue.getByRole('radio')).not.toBeChecked()
    await dialogue.getByRole('radio').check()
    await expect(dialogue).toContainText('Une personne porte déjà ce nom.')
    await expect(dialogue.getByRole('region', { name: 'Données proposées pour ce locuteur' })).toContainText('Pseudonyme : Alice')
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await nom.fill('Mme Dupont')
    await nom.press('Tab')
    await page.locator('.barre .retour').click()
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const source = vue.locuteurs.find((l: any) => l.locuteurId === 'marie-source')
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Mme Dupont')
    expect(cible.personneRef).toBeTruthy()
    expect(cible.personneRef).toBe(source.personneRef)
    expect(cible.pseudo).toBe('Alice')
    expect(cible.pseudoEtat).toBe('confirme')
    expect(cible.interviewer).toBe(false)
    expect(vue.personnes).toHaveLength(1)
  } finally { await app.close() }
})
