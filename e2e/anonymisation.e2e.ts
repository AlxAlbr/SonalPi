import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ajouterParModale, retourCorpus } from './util'

/**
 *  E2E round-trip ANONYMISATION : importer un `.sonal`
 *  SonalPi1 anonymisé (spans anon + exception + anon-json de règles corpus) →
 *  l'exporter → le ré-importer → les règles corpus SURVIVENT sans doublon
 *  (texte + exceptions + règles, sans perte), dans la vraie app.
 */

const FIXTURE = join(process.cwd(), 'test', 'fixtures', 'entretien1.sonal')

test('round-trip anonymisation : import → export → ré-import, règles corpus préservées sans doublon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-anon-'))
  const out1 = join(dir, 'anon-1.sonal')
  const out2 = join(dir, 'anon-2.sonal')

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Dialogs — ÉTAPE 1 : import → fixture, export → out1.
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
  }, { fixture: FIXTURE, out: out1 })

  // --- IMPORT de la fixture anonymisée ---
  await ajouterParModale(page, ['texte'])
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
  // Les occurrences anon (barrées) et l'exception sont décorées dans le texte.
  await expect(page.locator('.editeur .anon').first()).toBeVisible()
  await expect(page.locator('.editeur .anon-exception').first()).toBeVisible()

  // --- EXPORT --- (l'entretien est ouvert → bouton « Exporter .sonal »)
  await page.locator('.exporter').click()
  await expect.poll(() => existsSync(out1), { timeout: 10_000 }).toBe(true)
  const exporte = readFileSync(out1, 'utf8')
  expect(exporte).toContain('contenuText')
  expect(exporte).toContain('class="anon') // le span barré est re-sérialisé
  expect(exporte).toContain('anon-exception') // l'exception survit
  expect(exporte).toContain('"portee":"corpus"') // la règle corpus est ré-émise

  // --- Compte des règles après le 1ᵉʳ import (référence anti-doublon) ---
  await retourCorpus(page)
  await page.getByRole('button', { name: 'Pseudonymisation' }).click()
  await expect(page.locator('.pseudo-panneau')).toBeVisible()
  const nbAvant = await page.locator('.pseudo-table tbody tr').count()
  expect(nbAvant).toBeGreaterThanOrEqual(1)
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil' }).click()

  // --- RÉ-IMPORT du .sonal exporté (2ᵉ entretien, même corpus) ---
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
  }, { fixture: out1, out: out2 })
  await ajouterParModale(page, ['texte'])
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
  await expect(page.locator('.editeur .anon').first()).toBeVisible()

  // --- VÉRIF d'absence de doublon : onglet Pseudonymisation → même nombre de lignes ---
  await retourCorpus(page)
  await page.getByRole('button', { name: 'Pseudonymisation' }).click()
  await expect(page.locator('.pseudo-panneau')).toBeVisible()
  await expect
    .poll(async () => page.locator('.pseudo-table tbody tr').count(), { timeout: 10_000 })
    .toBe(nbAvant)
  // L'entité « Karine » (règle de la fixture) n'apparaît qu'une seule fois.
  await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Karine' })).toHaveCount(1)

  await app.close()
})
