import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ecrireSeedDemo, entrerCorpus, lancer } from './util'

test('les projections gardent leur dernier résultat et replient les entretiens indisponibles', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-fraicheur-'))
  const dirCorpus = join(dir, 'corpus')
  ecrireSeedDemo(dirCorpus)
  const cheminCorpus = join(dirCorpus, 'corpus.json')
  const cheminSecours = join(dirCorpus, 'corpus.json.test')
  const cheminEntretien = join(dirCorpus, 'entretiens', 'e1.json')
  const entretien = JSON.parse(readFileSync(cheminEntretien, 'utf8'))
  entretien.notes = [{
    id: 'note-fraicheur',
    categorieId: 'ncat_generale',
    titre: 'Résultat lisible',
    date: null,
    statut: 'public',
    corps: 'Contenu conservé',
    locuteurIds: [],
    rang: 0,
    creeLe: '2025-01-01T10:00:00.000Z',
    modifieLe: null,
  }]
  writeFileSync(cheminEntretien, JSON.stringify(entretien, null, 2), 'utf8')

  const app = await lancer(dir)
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)

    renameSync(cheminCorpus, cheminSecours)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    const notes = page.locator('.notes-corpus')
    await expect(notes.getByRole('button', { name: 'Réessayer' })).toBeVisible()
    await expect(notes.getByRole('alert')).toBeVisible()

    renameSync(cheminSecours, cheminCorpus)
    await notes.getByRole('button', { name: 'Réessayer' }).click()
    await expect(notes.locator('.tableau-notes tbody tr', { hasText: 'Résultat lisible' })).toBeVisible()
    await expect(notes.getByRole('alert')).toHaveCount(0)

    renameSync(cheminCorpus, cheminSecours)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens', exact: true }).click()
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    await expect(notes.locator('.tableau-notes tbody tr', { hasText: 'Résultat lisible' })).toBeVisible()
    await expect(notes.getByRole('alert')).toContainText('dernier résultat lisible')

    renameSync(cheminSecours, cheminCorpus)
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens', exact: true }).click()
    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    await expect(notes.getByRole('alert')).toHaveCount(0)

    const corpus = JSON.parse(readFileSync(cheminCorpus, 'utf8'))
    corpus.membership.indisponible = {
      titre: 'Entretien indisponible',
      date: null,
      lastModified: new Date().toISOString(),
    }
    writeFileSync(cheminCorpus, JSON.stringify(corpus, null, 2), 'utf8')

    await page.locator('.onglets-corpus').getByRole('button', { name: 'Personnes', exact: true }).click()
    const personnes = page.locator('.personnes-corpus')
    const detailPersonnes = personnes.locator('details.inventaire-incomplet')
    await expect(detailPersonnes.getByText('1 entretien indisponible', { exact: true })).toBeVisible()
    await expect(detailPersonnes).not.toHaveAttribute('open', '')
    await detailPersonnes.locator('summary').click()
    await expect(detailPersonnes).toContainText('Entretien indisponible')

    await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
    const detailNotes = notes.locator('details.inventaire-incomplet')
    await expect(detailNotes.getByText('1 entretien indisponible', { exact: true })).toBeVisible()
    await expect(detailNotes).not.toHaveAttribute('open', '')
  } finally {
    await app.close()
  }
})
