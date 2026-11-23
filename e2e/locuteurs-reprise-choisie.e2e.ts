import { test, expect } from '@playwright/test'
import { ouvrir, ouvrirDetailsLocuteurs } from './util'

test('la reprise simplifiée au nommage peut être désactivée', async () => {
  const { app, page } = await ouvrir('sonal-personnes-reprise-nommage-')
  try {
    await page.evaluate(async () => {
      const api = (window as any).sonal.corpus
      const { id } = await api.creerEntretienVide('Source Marie')
      const { data } = await api.lireEntretien(id)
      const { formatVersion, lastModified, ...payload } = data
      payload.participations = [{ id: 'marie-source', index: 0, nom: 'Marie Dupont', pseudo: 'Alice', interviewer: true, valeursLoc: {}, locuteurRef: null }]
      await api.ecrireEntretien(id, payload)
    })
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const nom = page.locator('.nom-loc').first()
    await nom.fill('Marie Dupont')
    await nom.press('Tab')
    const dialogue = page.getByRole('dialog', { name: 'Est-ce le même locuteur ?' })
    await dialogue.getByRole('radio').check()
    const reprise = dialogue.getByRole('checkbox', { name: /Reprendre les informations disponibles/ })
    await expect(reprise).toBeChecked()
    await reprise.uncheck()
    const avant = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(avant.locuteurs).toHaveLength(1)
    expect(avant.participations.find((p) => p.entretienId === 'e1' && p.nom === 'Marie Dupont')?.locuteurRef).toBe(avant.locuteurs[0].id)
    await dialogue.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
    await ouvrirDetailsLocuteurs(page)
    const panneau = page.locator('.details-locuteurs')
    await panneau.locator('summary').filter({ hasText: 'Propositions présentées (0)' }).click()
    await expect(panneau.getByRole('region', { name: 'Suggestions à vérifier' })).toContainText('Aucun rapprochement proposé.')
    const vue = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    const source = vue.participations.find((l) => l.participationId === 'marie-source')
    const cible = vue.participations.find((l) => l.nom === 'Marie Dupont' && l.participationId !== 'marie-source')
    if (!source || !cible) throw new Error('Participations attendues absentes de l’inventaire.')
    expect(vue.locuteurs).toHaveLength(1)
    expect(cible.locuteurRef).toBe(avant.locuteurs[0].id)
    expect(cible.locuteurRef).toBe(source.locuteurRef)
    expect(cible.pseudo).not.toBe('Alice')
    expect(cible.interviewer).toBeUndefined()
  } finally { await app.close() }
})
