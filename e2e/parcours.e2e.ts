import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, coderTheme, compterAnnotations, ajouterParModale } from './util'

/**
 * LE JUGE DE PAIX : le parcours complet à travers les trois écrans
 * (Corpus → Entretien), sur un entretien réel. Prouve que les pièces (navigation,
 * import, édition, locuteurs, données à 2 niveaux, export) COMPOSENT sans se casser.
 * La réouverture dans SonalPi reste manuelle (PARITE.md).
 */
const FIXTURE = join(process.cwd(), 'test', 'fixtures', 'entretien1.sonal')

test('corpus → import → coder → renommer un locuteur → saisir une donnée → exporter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-parcours-'))
  const cheminExport = join(dir, 'parcours.sonal')

  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  await app.evaluate(({ dialog }, args) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [args.fixture] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: args.out })
  }, { fixture: FIXTURE, out: cheminExport })

  // 1) IMPORT d'un .sonal réel (modale d'ajout) → ouvre le nouvel entretien.
  await ajouterParModale(page, ['texte'])
  await expect(page.locator('.editeur')).toContainText('accepté cet entretien', { timeout: 10_000 })

  // 2) CODER un passage supplémentaire (le modèle gagne une annotation).
  const avant = await compterAnnotations(page)
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Famille')
  await expect.poll(() => compterAnnotations(page)).toBe(avant + 1)

  // 3) RENOMMER un locuteur (répercuté par référence).
  await page.locator('.onglets button[data-onglet="locuteurs"]').click()
  await page.locator('.nom-loc').first().fill('TEST-LOCUTEUR')
  await page.keyboard.press('Tab')

  // 4) SAISIR une donnée EAV de portée entretien — la variable « Lieu » (importée)
  //    offre la modalité « MonTest » : on la choisit (fiche de CET entretien).
  await page.locator('.onglets button[data-onglet="donnees"]').click()
  await page.locator('.saisie-sel').first().selectOption({ label: 'MonTest' })
  await expect(page.locator('.etat')).toHaveText('à jour')

  // 5) EXPORTER → le .sonal est cohérent : structure + locuteur renommé conservés.
  await page.locator('.exporter').click()
  await expect
    .poll(() => (existsSync(cheminExport) ? readFileSync(cheminExport, 'utf8').length : 0), { timeout: 10_000 })
    .toBeGreaterThan(1000)
  const exporte = readFileSync(cheminExport, 'utf8')
  expect(exporte).toContain('contenuText')
  expect(exporte).toContain('lblseg')
  expect(exporte).toContain('TEST-LOCUTEUR') // le renommage a suivi jusqu'à l'export

  await app.close()
})
