import { test, expect } from '@playwright/test'
import { creerLocuteurFixture } from '../test/fixtures/identitesLocuteurs'
import { ouvrir, retourCorpus, ouvrirDetailsLocuteurs } from './util'

test('renommer comme un autre locuteur ne déplace aucun lien ; seule la réunion explicite regroupe', async () => {
  const { app, page } = await ouvrir('sonal-personnes-deplacement-')
  try {
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    const gestion = page.getByRole('dialog', { name: 'Gestion des locuteurs', exact: true }), nom = gestion.locator('.nom-loc').first()
    await nom.fill('Marie Dupont'); await nom.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Locuteur « Marie Dupont » créé' })).toBeVisible()
    const avant = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs()), cible = avant.participations.find((p) => p.entretienId === 'e1' && p.nom === 'Marie Dupont')!
    const source = await page.evaluate(async () => {
      const api = window.sonal.corpus, { id } = await api.creerEntretienVide('Autre identité'), r = await api.lireEntretien(id)
      if (!r.ok) throw new Error('Source absente')
      const { formatVersion: _v, lastModified: _d, ...payload } = r.data
      payload.participations = [{ id: 'source', index: 0, nom: 'Paul Martin', valeursLoc: {}, locuteurRef: null }]
      await api.ecrireEntretien(id, payload)
      return { entretienId: id, participationId: 'source', dir: (await api.dossierCourant()).dir }
    })
    const sourceId = creerLocuteurFixture(source.dir, 'Paul Martin', [source])
    await nom.fill('Paul Martin'); await nom.press('Enter')
    const renommage = page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })
    await expect(nom).toHaveValue('Paul Martin'); await expect(nom).toBeEnabled()
    await expect(renommage).toHaveCount(0)
    const apresNom = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(apresNom.participations.find((p) => p.entretienId === 'e1' && p.participationId === cible.participationId)).toEqual({ ...cible, nom: 'Paul Martin' })
    expect(apresNom.locuteurs).toHaveLength(2); expect(cible.locuteurRef).not.toBe(sourceId)
    await expect(page.getByRole('dialog', { name: 'Une personne déjà rencontrée ?' })).toHaveCount(0)
    await gestion.getByRole('button', { name: 'Fermer la gestion des locuteurs' }).click(); await retourCorpus(page)
    await ouvrirDetailsLocuteurs(page)
    const details = page.locator('.details-locuteurs')
    await details.locator('summary').filter({ hasText: 'Propositions présentées (1)' }).click()
    await details.getByRole('button', { name: 'Comparer ces locuteurs' }).click()
    await page.locator('.locuteurs-corpus').getByRole('button', { name: 'C’est le même locuteur…' }).click()
    const reunir = page.getByRole('dialog', { name: 'Réunir les locuteurs sélectionnés' })
    await reunir.getByRole('radio', { name: 'Conserver les noms actuels', exact: true }).check()
    await reunir.getByRole('button', { name: 'Réunir les locuteurs', exact: true }).click(); await expect(reunir).toHaveCount(0)
    const apres = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(apres.locuteurs).toHaveLength(1)
    expect(apres.participations.filter((p) => p.nom === 'Paul Martin').every((p) => p.locuteurRef === apres.locuteurs[0].id)).toBe(true)
    await expect(page.locator('.locuteurs-corpus').getByLabel('Associer à')).toHaveCount(0)
  } finally { await app.close() }
})
