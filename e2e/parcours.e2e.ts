import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, coderTheme, compterAnnotations, ajouterParModale, selectionner, ouvrirOrganisation } from './util'

const FIXTURE = join(process.cwd(), 'test', 'fixtures', 'entretien1.sonal')

test('corpus → import V1 → coder → renommer globalement → saisir une donnée → exporter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-parcours-')), destination = join(dir, 'export')
  const app = await lancer(dir)
  try {
    const page = await app.firstWindow(); await entrerCorpus(page)
    await app.evaluate(({ dialog }, args) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
    }, { fixture: FIXTURE, out: destination })
    await ajouterParModale(page, ['texte'])
    await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
    const avant = await compterAnnotations(page)
    await selectionner(page, 'Karine'); await coderTheme(page, 'Famille')
    await expect.poll(() => compterAnnotations(page)).toBe(avant + 1)
    await page.locator('.onglets button[data-onglet="locuteurs"]').click()
    await page.getByRole('button', { name: 'Modifier les locuteurs', exact: true }).click()
    await page.locator('.nom-loc').first().fill('TEST-LOCUTEUR'); await page.locator('.nom-loc').first().press('Enter')
    await expect.poll(() => page.evaluate(async () =>
      (await window.sonal.corpus.inventaireIdentitesLocuteurs()).locuteurs.some((p) => p.nom === 'TEST-LOCUTEUR'))).toBe(true)
    await expect(page.locator('.nom-loc').first()).toBeEnabled()
    await page.locator('.nom-loc').first().fill('TEST-LOCUTEUR-RENOMME'); await page.locator('.nom-loc').first().press('Enter')
    const renommage = page.getByRole('dialog', { name: 'Renommer ce locuteur dans les entretiens', exact: true })
    await expect(page.locator('.nom-loc').first()).toHaveValue('TEST-LOCUTEUR-RENOMME')
    await expect(page.locator('.nom-loc').first()).toBeEnabled()
    await expect(renommage).toHaveCount(0)
    await page.getByRole('button', { name: 'Fermer la gestion des locuteurs', exact: true }).click()
    await page.locator('.outils-editeur button[data-onglet="donnees"]').click()
    await page.getByRole('tab', { name: 'Entretien', exact: true }).click()
    await page.locator('.saisie-eav-sel').first().selectOption({ label: 'MonTest' })
    await expect(page.locator('header .etat')).toHaveText('à jour')
    await ouvrirOrganisation(page, 'export')
    const espace = page.locator('.export-corpus')
    await espace.getByLabel('Tous les entretiens').uncheck()
    await espace.locator('.ligne-entretien').filter({ hasText: 'entretien1' }).getByRole('checkbox').check()
    await espace.getByLabel('Texte brut (.txt)', { exact: false }).check()
    await espace.getByLabel('Locuteurs', { exact: true }).check()
    await espace.getByLabel('Variables', { exact: true }).check()
    await espace.getByLabel('Appliquer la pseudonymisation', { exact: true }).uncheck()
    const corpusAvant = readFileSync(join(dir, 'corpus', 'corpus.crp'), 'utf8')
    await espace.locator('.actions .exporter').click()
    await expect(espace.locator('.etape', { hasText: 'Export terminé' })).toBeVisible({ timeout: 20_000 })
    const documents = readdirSync(destination).filter((nom) => nom.endsWith('.txt') && nom !== '_index.txt')
    expect(documents).toHaveLength(1)
    const exporte = readFileSync(join(destination, documents[0]), 'utf8')
    expect(exporte).toContain('accepté cet entretien'); expect(exporte).toContain('TEST-LOCUTEUR-RENOMME'); expect(exporte).toContain('MonTest')
    expect(readFileSync(join(dir, 'corpus', 'corpus.crp'), 'utf8')).toBe(corpusAvant)
  } finally { await app.close() }
})
