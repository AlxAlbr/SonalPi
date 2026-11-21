import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerLocuteurFixture, installerIdentitesFixture } from '../test/fixtures/identitesLocuteurs'
import { entrerCorpus, lancer } from './util'

test('réunir depuis la sélection : aperçu, annulation, refus périmé et conservation des noms locaux', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-regroupement-e2e-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const sources = await page.evaluate(async () => {
      const api = window.sonal.corpus, sources: { entretienId: string; nom: string }[] = []
      for (const [titre, nom, pseudo] of [['Entretien A', 'Marie Dupont', 'Alice'], ['Entretien B', 'Mme Dupont', 'Lou']]) {
        const { id } = await api.creerEntretienVide(titre), r = await api.lireEntretien(id)
        if (!r.ok) throw new Error('Fixture absente')
        const { formatVersion: _v, lastModified: _d, ...payload } = r.data
        payload.participations = [{ id: 'local', index: 0, nom, pseudo, interviewer: false, valeursLoc: {}, locuteurRef: null }]
        await api.ecrireEntretien(id, payload)
        sources.push({ entretienId: id, nom })
      }
      return sources
    })
    const ids = sources.map((s) => creerLocuteurFixture(join(dir, 'corpus'), s.nom, [{ entretienId: s.entretienId, participationId: 'local' }]))
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
    const panneau = page.locator('.locuteurs-corpus')
    await panneau.getByRole('option').filter({ has: page.getByText('Marie Dupont', { exact: true }) }).click()
    await panneau.getByRole('option').filter({ has: page.getByText('Mme Dupont', { exact: true }) }).click({ modifiers: ['Control'] })
    const ouvrir = panneau.getByRole('button', { name: 'C’est le même locuteur…', exact: true })
    await ouvrir.click()
    const dialogue = page.getByRole('dialog', { name: 'Réunir les locuteurs sélectionnés', exact: true })
    await expect(dialogue).toContainText('2 locuteurs seront réunis dans 2 entretiens')
    await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeFocused()
    await page.keyboard.press('Escape'); await expect(dialogue).toHaveCount(0); await expect(ouvrir).toBeFocused()
    expect((await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())).locuteurs).toHaveLength(2)
    await ouvrir.click()
    installerIdentitesFixture(join(dir, 'corpus'), { locuteurs: [{ id: ids[0], nom: 'Marie D.' }] })
    await dialogue.getByRole('radio', { name: 'Conserver les noms actuels', exact: true }).check()
    await dialogue.getByRole('button', { name: 'Réunir les locuteurs', exact: true }).click()
    await expect(dialogue.getByRole('alert')).toContainText('ont changé')
    expect((await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())).locuteurs).toHaveLength(2)
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    await panneau.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await expect(panneau.getByRole('option').filter({ has: page.getByText('Marie D.', { exact: true }) })).toBeVisible()
    await ouvrir.click(); await dialogue.getByLabel('Nom commun', { exact: true }).fill('Marie D.')
    await dialogue.getByRole('radio', { name: 'Conserver les noms actuels', exact: true }).check()
    await dialogue.getByRole('button', { name: 'Réunir les locuteurs', exact: true }).click(); await expect(dialogue).toHaveCount(0)
    const apres = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(apres.locuteurs).toEqual([{ id: ids[0], nom: 'Marie D.' }])
    expect(apres.participations.find((p) => p.entretienTitre === 'Entretien A')).toMatchObject({ nom: 'Marie Dupont', pseudo: 'Alice', locuteurRef: ids[0] })
    expect(apres.participations.find((p) => p.entretienTitre === 'Entretien B')).toMatchObject({ nom: 'Mme Dupont', pseudo: 'Lou', locuteurRef: ids[0] })
    await expect(panneau.locator('.personnes-corpus')).toHaveCount(0)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
