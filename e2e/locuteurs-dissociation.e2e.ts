import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { creerLocuteurFixture } from '../test/fixtures/identitesLocuteurs'
import { entrerCorpus, lancer } from './util'

test('dissocier rend chaque voix cochée indépendante, sans nouveau nom ni ancien formulaire de séparation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-separation-e2e-')), app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    const references = await page.evaluate(async () => {
      const api = window.sonal.corpus, inv = await api.inventaireIdentitesLocuteurs(), karine = inv.participations.find((p) => p.nom === 'Karine')!
      const references = [{ entretienId: karine.entretienId, participationId: karine.participationId }]
      for (const [titre, nom] of [['Entretien B', 'Mme Dupont'], ['Entretien C', 'K. Dupont']]) {
        const creation = await api.creerEntretienVide(titre), lecture = await api.lireEntretien(creation.id)
        if (!lecture.ok) throw new Error('Fixture absente')
        const { formatVersion: _v, lastModified: _d, ...payload } = lecture.data
        payload.participations = [{ id: 'local', index: 0, nom, valeursLoc: {}, locuteurRef: null }]
        await api.ecrireEntretien(creation.id, payload)
        references.push({ entretienId: creation.id, participationId: 'local' })
      }
      return references
    })
    const id = creerLocuteurFixture(join(dir, 'corpus'), 'Karine Dupont', references)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Locuteurs', exact: true }).click()
    const panneau = page.locator('.locuteurs-corpus')
    await panneau.getByRole('option').filter({ has: page.getByText('Karine Dupont', { exact: true }) }).click()
    await panneau.getByRole('button', { name: 'Dissocier…', exact: true }).click()
    const dialogue = page.getByRole('dialog', { name: 'Dissocier ce locuteur', exact: true })
    await expect(dialogue.locator('input[type=text]')).toHaveCount(0)
    for (const c of await dialogue.getByRole('checkbox').all()) await c.check()
    await expect(dialogue).toContainText('Laissez au moins un entretien')
    await expect(dialogue.getByRole('button', { name: 'Dissocier les entretiens cochés' })).toBeDisabled()
    await dialogue.getByRole('checkbox', { name: 'Entretien Karine · Karine', exact: true }).uncheck()
    await expect(dialogue).toContainText('2 entretiens à dissocier ; 1 resteront associés')
    await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
    expect((await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())).locuteurs).toHaveLength(1)
    await panneau.getByRole('button', { name: 'Dissocier…', exact: true }).click()
    await dialogue.getByRole('checkbox', { name: 'Entretien B · Mme Dupont', exact: true }).check()
    await dialogue.getByRole('checkbox', { name: 'Entretien C · K. Dupont', exact: true }).check()
    await dialogue.getByRole('button', { name: 'Dissocier les entretiens cochés' }).click(); await expect(dialogue).toHaveCount(0)
    const inv = await page.evaluate(() => window.sonal.corpus.inventaireIdentitesLocuteurs())
    expect(inv.locuteurs).toHaveLength(3)
    expect(inv.participations.find((p) => p.nom === 'Karine')?.locuteurRef).toBe(id)
    const b = inv.participations.find((p) => p.nom === 'Mme Dupont')!, c = inv.participations.find((p) => p.nom === 'K. Dupont')!
    expect(b.locuteurRef).toBeTruthy(); expect(c.locuteurRef).toBeTruthy()
    expect(new Set([id, b.locuteurRef, c.locuteurRef]).size).toBe(3)
    await expect(panneau.locator('.separer-personne')).toHaveCount(0)
    await expect(panneau.getByRole('button', { name: 'Annuler une modification…' })).toHaveCount(0)
  } finally { await app.close(); rmSync(dir, { recursive: true, force: true }) }
})
