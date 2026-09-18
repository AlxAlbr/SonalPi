import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, ajouterParModale } from './util'

/**
 *  Sas d'import / export `.sonal`, dans la vraie app. Les dialogs natifs
 *  (showOpenDialog / showSaveDialog) sont STUBBÉS via electronApp.evaluate pour
 *  piloter sans interaction. Critères : import d'un `.sonal` réel → entretien
 *  éditable + codebook fusionné ; export → `.sonal` réémis. (Golden import/export
 *  détaillé en unitaire ; réouverture dans SonalPi1 = test manuel, cf. PARITE.md.)
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

  // --- IMPORT --- (modale d'ajout, zone texte seule → ouvre le nouvel entretien)
  await ajouterParModale(page, ['texte'])

  // Le nouvel entretien s'ouvre (texte propre à la fixture) et « entretien1 »
  // apparaît dans la liste (titre = valeur d'un <input>, d'où getByDisplayValue).
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })
  await expect(page.locator('.carte-ent')).toHaveCount(2) // seed + importé
  await expect(page.locator('.carte-ent .ent-titre').nth(1)).toHaveText('entretien1')
  // Les codages importés peuplent le modèle : les passages cat_005 du fixture sont décorés ;
  // leur titre affiche le NOM résolu au codebook du corpus.
  // (l'existant fait foi — cat_005 du seed « ★★★ Très important », pas « Cat1 »).
  await expect(page.locator('.editeur .annot[title="★★★ Très important"]').first()).toBeVisible()
  // Le codebook a fusionné : cat_008 (« Cat2 », un code de la fixture HORS seed)
  // est dans l'onglet Thématique (clic=coder).
  // Les codes ≤ cat_007 collisionnent avec le seed (3 démo + Pondérations) :
  // l'existant fait foi (règle n°3).
  await expect(page.locator('.liste-coder .theme-nom', { hasText: /^Cat2$/ })).toHaveCount(1)

  // --- EXPORT ---
  await page.locator('.exporter').click()
  // Fenêtre d'export en deux étapes : format `.sonal`, puis bouton Exporter.
  await page.locator('.ligne-format', { hasText: '.sonal' }).click()
  await page.locator('.actions .exporter').click()
  await expect
    .poll(() => existsSync(cheminExport), { timeout: 10_000 })
    .toBe(true)

  const exporte = readFileSync(cheminExport, 'utf8')
  expect(exporte).toContain('contenuText')
  expect(exporte).toContain('lblseg')
  expect(exporte).toContain('cat_005')

  await app.close()
})
