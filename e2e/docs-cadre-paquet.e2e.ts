import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, lancer, ouvrirPreparation } from './util'

const executablePath = process.env.DOCS_E2E_EXECUTABLE
test.skip(!executablePath, 'Définir DOCS_E2E_EXECUTABLE pour tester le paquet installé.')

test('le paquet contient les deux exemples DPO dans leur sous-dossier', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-docs-paquet-')), { executablePath })
  try {
    expect(await app.evaluate(({ app: application }) => application.isPackaged)).toBe(true)
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await ouvrirPreparation(page, 'documents-exemples')
    const cote = page.locator('.cote-docs')
    await expect(cote.locator('.document .nom')).toHaveText(['DPO', 'Guide de correction.txt', 'Guide de pseudonymisation.txt'])
    await cote.getByRole('button', { name: 'Dossier : DPO' }).click()
    await expect(cote.locator('.document .nom')).toHaveText(['Déclaration traitement DPO.txt', 'Notice de consentement DPO.txt'])
    for (const nom of ['Déclaration traitement DPO.txt', 'Notice de consentement DPO.txt']) {
      await cote.locator('.document', { hasText: nom }).click()
      await expect(page.locator('.texte-echappe')).toContainText('À venir.')
    }
    await expect(page.getByRole('button', { name: 'Afficher dans le dossier' })).toHaveCount(0)
  } finally { await app.close() }
})
