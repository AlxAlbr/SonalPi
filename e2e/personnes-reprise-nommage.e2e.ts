import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

test('la reprise simplifiée au nommage peut être désactivée', async () => {
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
    await page.locator('[data-onglet="locuteurs"]').click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })
    await dialogue.getByRole('radio').check()
    const reprise = dialogue.getByRole('checkbox', { name: /Reprendre les informations disponibles/ })
    await expect(reprise).toBeChecked()
    await reprise.uncheck()
    const avant = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    expect(avant.personnes).toHaveLength(0)
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const panneau = page.locator('.personnes-corpus')
    await expect(panneau.getByRole('button', { name: 'À vérifier 0', exact: true })).toBeVisible()
    await expect(panneau.getByRole('region', { name: 'Suggestions à vérifier' })).toContainText('Aucun rapprochement proposé.')
    const vue = await page.evaluate(async () => (window as any).sonal.corpus.personnesInventaire())
    const source = vue.locuteurs.find((l: any) => l.locuteurId === 'marie-source')
    const cible = vue.locuteurs.find((l: any) => l.nom === 'Marie Dupont' && l.locuteurId !== 'marie-source')
    expect(cible.personneRef).toBe(source.personneRef)
    expect(cible.pseudo).not.toBe('Alice')
    expect(cible.interviewer).toBe(false)
  } finally { await app.close() }
})
