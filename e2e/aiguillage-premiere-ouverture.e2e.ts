import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { lancer, attendreAccueil, attendreCorpus, ecrireSeedDemo } from './util'

/**
 *  Première ouverture d'un corpus sur un poste : l'app atterrit sur l'accueil de
 *  « Préparer et suivre » et une fenêtre d'aiguillage propose le premier geste
 *  (corriger un entretien / gérer le projet). Le choix suivant n'est plus
 *  demandé : la navigation reprise est celle qui a été laissée.
 */
const aiguillage = (page: import('@playwright/test').Page) => page.locator('.modale-aiguillage')

test('première ouverture : aiguillage affiché, puis « gestion de projet »', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-'))
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-corpus-'))
  ecrireSeedDemo(dossier)
  let app = await lancer(profil)
  let page = await app.firstWindow()
  await attendreAccueil(page)
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dossier)
  await page.locator('.ouvrir-dossier').click()

  // L'accueil de la préparation est déjà en place derrière la fenêtre.
  await expect(aiguillage(page)).toBeVisible()
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Télécharger un entretien pour le corriger' })).toBeVisible()
  await expect(page.getByRole('button', { name: "Aller vers l'interface de gestion de projet" })).toBeVisible()
  await expect(aiguillage(page)).toContainText('Vous pourrez ensuite passer de l\'un à l\'autre')

  await page.getByRole('button', { name: "Aller vers l'interface de gestion de projet" }).click()
  await expect(aiguillage(page)).toHaveCount(0)
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(page.locator('[data-tour="ouvrir-accueil-preparation"]')).toHaveAttribute('aria-current', 'page')

  // La question ne revient pas ; l'espace quitté est repris.
  await page.getByRole('button', { name: 'Analyser et interpréter', exact: true }).click()
  await page.locator('[data-tour="ouvrir-lexico"]').click()
  await app.close()

  app = await lancer(profil, { preserverSettings: true })
  page = await app.firstWindow()
  await attendreAccueil(page)
  await page.locator('.recents .recent', { hasText: basename(dossier) }).click()
  await expect(page.locator('.espace-analyse')).toBeVisible()
  await expect(aiguillage(page)).toHaveCount(0)
  await app.close()
})

test('première ouverture : « corriger un entretien » mène aux entretiens du corpus', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-liste-'))
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-liste-corpus-'))
  ecrireSeedDemo(dossier)
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dossier)
  await page.locator('.ouvrir-dossier').click()
  await expect(aiguillage(page)).toBeVisible()

  await page.getByRole('button', { name: 'Télécharger un entretien pour le corriger' }).click()
  await expect(aiguillage(page)).toHaveCount(0)
  await attendreCorpus(page)
  await expect(page.locator('.carte-ent')).toHaveCount(1)
  await app.close()
})

test('première ouverture d’un corpus vide : « corriger » ouvre l’ajout d’entretien', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-vide-'))
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-vide-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dossier)
  await page.locator('.ouvrir-dossier').click()
  await expect(aiguillage(page)).toBeVisible()

  await page.getByRole('button', { name: 'Télécharger un entretien pour le corriger' }).click()
  await expect(page.locator('.modale-ajout')).toBeVisible()
  await app.close()
})

test('refermer l’aiguillage laisse l’accueil affiché et ne le remontre plus', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-fermer-'))
  const dossier = mkdtempSync(join(tmpdir(), 'sonal-aiguillage-fermer-corpus-'))
  ecrireSeedDemo(dossier)
  let app = await lancer(profil)
  let page = await app.firstWindow()
  await attendreAccueil(page)
  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dossier)
  await page.locator('.ouvrir-dossier').click()
  await expect(aiguillage(page)).toBeVisible()

  await aiguillage(page).getByRole('button', { name: 'Fermer' }).click()
  await expect(aiguillage(page)).toHaveCount(0)
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await app.close()

  app = await lancer(profil, { preserverSettings: true })
  page = await app.firstWindow()
  await attendreAccueil(page)
  await page.locator('.recents .recent', { hasText: basename(dossier) }).click()
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(aiguillage(page)).toHaveCount(0)
  await app.close()
})
