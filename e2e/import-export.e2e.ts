import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus } from './util'

/**
 * ÉTAPE 3 — sas d'import / export `.sonal`, dans la vraie app. Les dialogs natifs
 * (showOpenDialog / showSaveDialog) sont STUBBÉS via electronApp.evaluate pour
 * piloter sans interaction. Critères : import d'un `.sonal` réel → entretien
 * éditable + codebook fusionné ; export → `.sonal` réémis. (Golden import/export
 * détaillé en unitaire ; réouverture dans SonalPi = test manuel, cf. PARITE.md.)
 */

const FIXTURE = join(process.cwd(), 'test', 'fixtures', 'entretien1.sonal')

test('importer un .sonal réel → entretien éditable + codebook fusionné, puis exporter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-imp-'))
  const cheminExport = join(dir, 'export-test.sonal')

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page) // l'app atterrit sur l'écran Corpus (le bouton Importer y est)

  // Stub des dialogs : import renvoie la fixture, export écrit dans un chemin connu.
  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
  }, { fixture: FIXTURE, out: cheminExport })

  // --- IMPORT --- (l'import ouvre le nouvel entretien → bascule écran Entretien)
  await page.locator('.corpus-tete .mini', { hasText: 'Importer' }).click()

  // Le nouvel entretien s'ouvre (texte propre à la fixture) et « entretien1 »
  // apparaît dans la liste (titre = valeur d'un <input>, d'où getByDisplayValue).
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
  await expect(page.locator('.ents li')).toHaveCount(2) // seed + importé
  await expect(page.locator('.ents li .titre').nth(1)).toHaveValue('entretien1')
  // Les codages importés peuplent le modèle (cat_005 présent).
  await expect(page.locator('.debug li code', { hasText: 'cat_005' }).first()).toBeVisible()
  // Le codebook a fusionné : cat_005 (« Cat1 ») est dans l'onglet Thématique (clic=coder).
  await expect(page.locator('.liste-coder .theme-nom', { hasText: /^Cat1$/ })).toHaveCount(1)

  // --- EXPORT ---
  await page.locator('.exporter').click()
  await expect
    .poll(() => existsSync(cheminExport), { timeout: 10_000 })
    .toBe(true)

  const exporte = readFileSync(cheminExport, 'utf8')
  expect(exporte).toContain('contenuText')
  expect(exporte).toContain('lblseg')
  expect(exporte).toContain('cat_005')

  await app.close()
})
