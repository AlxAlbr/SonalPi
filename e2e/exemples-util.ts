import { expect, type ElectronApplication, type Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Isole les fichiers d'exercice dans le profil temporaire du scénario. */
export async function configurerSourcesExemples(app: ElectronApplication, sources: string): Promise<void> {
  const profil = await app.evaluate(({ app }) => app.getPath('userData'))
  const chemin = join(profil, 'settings.json')
  const settings = JSON.parse(readFileSync(chemin, 'utf8'))
  settings.exemples = { sources, travaux: [], apprentissages: {}, libres: {} }
  writeFileSync(chemin, JSON.stringify(settings))
}
export async function choisirDossierExemple(app: ElectronApplication, dir: string): Promise<void> {
  await app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
  }, dir)
}
export async function preparerApprentissage(app: ElectronApplication, page: Page, sources: string, dir: string, parcours: 'preparation' | 'traitement' | 'analyse' | 'organisation', etape?: string): Promise<void> {
  await configurerSourcesExemples(app, sources)
  await choisirDossierExemple(app, dir)
  await page.locator('.carte-demo.parcours').click()
  const catalogue = page.getByRole('dialog', { name: 'Choisir un parcours pas à pas' })
  await catalogue.getByRole('button', { name: parcours === 'preparation' ? /^Préparer et suivre/ : parcours === 'traitement' ? /^Importer et traiter/ : parcours === 'organisation' ? /^Organiser et exporter/ : /^Analyser et interpréter/ }).click()
  await catalogue.getByRole('button', { name: etape ?? 'Commencer le parcours', exact: !etape }).click()
  if (parcours === 'organisation') {
    await expect(page.locator('.installation-exemple')).toContainText('Une copie indépendante du corpus annoté')
    await expect(page.locator('.installation-exemple')).not.toContainText('Le corpus vide')
  }
  const nomDossier = { preparation: 'Preparer_et_suivre', traitement: 'Importer_et_traiter', analyse: 'Analyser_et_interpreter', organisation: 'Organiser_et_exporter' }[parcours]
  await expect(page.locator('#emplacement-exemple')).toHaveValue(new RegExp(`[\\\\/]${nomDossier}$`))
  await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
  await page.locator('.installation-exemple').getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(catalogue).not.toBeVisible()
  await expect(['analyse', 'organisation'].includes(parcours) ? page.getByTestId('consigne-pas-a-pas') : page.locator('.spotlight-bulle')).toBeVisible()
}
