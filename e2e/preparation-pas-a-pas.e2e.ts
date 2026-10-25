import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attendreAccueil, attendreCorpus, lancer, spotlightSur } from './util'

async function ouvrirCatalogueParcours(page: import('@playwright/test').Page): Promise<void> {
  if (await page.locator('.voile-catalogue-parcours').isVisible()) return
  await page.locator('.resume-parcours .secondaire').click()
  await expect(page.locator('.voile-catalogue-parcours')).toBeVisible()
}

async function preparerDecouverte(
  app: import('@playwright/test').ElectronApplication,
  page: import('@playwright/test').Page,
  sources: string,
  corpus: string,
): Promise<void> {
  await app.evaluate(({ dialog }, dossiers) => {
    let index = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [index++ === 0 ? dossiers.sources : dossiers.corpus],
    })
  }, { sources, corpus })
  await page.locator('.carte-demo.pas-a-pas').click()
  await page.locator('.modale-demo .choisir-dossier').first().click()
  await page.locator('.modale-demo .choisir-dossier').nth(1).click()
  await page.locator('.modale-demo .valider').click()
  await attendreCorpus(page)
}

test('parcours Préparer son terrain : suivi, document, entretien vide et note', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-preparation-'))
  const sources = mkdtempSync(join(tmpdir(), 'sonal-preparation-sources-'))
  const corpus = mkdtempSync(join(tmpdir(), 'sonal-preparation-corpus-'))
  const app = await lancer(profil)
  const page = await app.firstWindow()
  await attendreAccueil(page)
  await preparerDecouverte(app, page, sources, corpus)

  await expect(page.locator('.carte-parcours')).toHaveCount(2)
  await expect(page.locator('.detail-parcours h4').first()).toHaveText('Préparer son terrain')
  await expect(page.locator('.liste-pp li')).toHaveCount(4)
  await expect(page.locator('.spotlight-trou')).toHaveCount(0)

  // 1. La problématique est validée sur la cellule métier traversante.
  await page.locator('.liste-pp .ligne-pp').nth(0).click()
  await spotlightSur(page, '[data-tour="ouvrir-preparer"]')
  await page.locator('[data-tour="ouvrir-preparer"]').click()
  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(page.locator('.spotlight-bulle')).toBeVisible()
  // L'espace s'ouvre sur l'Accueil : le guidage désigne l'onglet à ouvrir.
  await spotlightSur(page, '[data-tour="ouvrir-tableau-bord"]')
  await page.locator('[data-tour="ouvrir-tableau-bord"]').click()
  await expect(page.getByTestId('consigne-pas-a-pas')).toBeVisible()
  await spotlightSur(page, '[data-tour="cellule-problematique"]')
  await page.locator('[data-tour="cellule-problematique"]').click()
  await expect(page.getByTestId('consigne-pas-a-pas')).toBeVisible()
  await page.locator('[data-tour="note-cellule-tableau"]').fill('Comment évolue l’aide aux devoirs ?')
  await page.locator('[data-tour="appliquer-cellule-tableau"]').click()
  await expect(page.locator('.liste-pp li').nth(0)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.espace-preparation')).not.toBeVisible()

  // 2. Le vrai sélecteur copie le guide dans Vos Documents.
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp .ligne-pp').nth(1).click()
  await spotlightSur(page, '[data-tour="ouvrir-preparer"]')
  await page.locator('[data-tour="ouvrir-preparer"]').click()
  await spotlightSur(page, '[data-tour="ouvrir-docs-cadre"]')
  await page.locator('[data-tour="ouvrir-docs-cadre"]').click()
  await expect(page.getByTestId('consigne-pas-a-pas')).toBeVisible()
  await app.evaluate(({ dialog }, chemin) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
  }, join(sources, 'docs', 'Guide-entretien-demo.txt'))
  await page.locator('[data-tour="ajouter-document-cadre"]').click()
  await expect(page.locator('.liste-pp li').nth(1)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.espace-preparation')).not.toBeVisible()

  // 3. Un entretien réellement vide est créé et son identité est mémorisée.
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp .ligne-pp').nth(2).click()
  await page.locator('[data-tour="ajouter-entretien"]').click()
  await page.locator('[data-tour="titre-entretien-vide"]').fill('Entretien préparatoire')
  await page.locator('.modale-ajout [data-tour="valider"]').click()
  await expect(page.locator('.liste-pp li').nth(2)).toHaveClass(/fait/, { timeout: 5_000 })
  await expect(page.locator('.carte-ent', { hasText: 'Entretien préparatoire' })).toBeVisible()

  // 4. La note est enregistrée sur cet entretien précis.
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp .ligne-pp').nth(3).click()
  const carte = page.locator('.carte-ent', { hasText: 'Entretien préparatoire' })
  await carte.locator('.crayon').click()
  await page.locator('[data-tour="onglet-notes"]').click()
  await page.locator('[data-tour="creer-note"]').click()
  await page.locator('.modale-note .champ-titre-note input').fill('Avant l’entretien')
  await page.locator('.modale-note .zone-corps-note').click()
  await page.keyboard.type('Demander comment les familles découvrent le dispositif.')
  await page.locator('.modale-note-pied .principal').click()
  await expect(page.locator('.fini-pp')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.rappel-parcours')).toContainText('Préparer son terrain')

  // Le traitement reste indépendant et cible 1Coordinatrice, pas la première carte.
  await page.locator('.fini-pp .fini-pp-btn.revenir').filter({ hasText: 'Voir le parcours' }).click()
  await page.locator('.carte-parcours').filter({ hasText: 'Traiter ses entretiens' }).locator('button').click()
  await app.evaluate(({ dialog }, fichiers) => {
    let index = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [index++ === 0 ? fichiers.srt : fichiers.audio],
    })
  }, {
    srt: join(sources, 'srt', '1Coordinatrice.srt'),
    audio: join(sources, 'audio', '1Coordinatrice.mp3'),
  })
  await page.locator('[data-tour="ajouter-entretien"]').click()
  await page.locator('[data-tour="zone-texte"]').click()
  await page.locator('[data-tour="zone-audio"]').click()
  await page.locator('.modale-ajout [data-tour="valider"]').click()
  await expect(page.locator('.liste-pp li').nth(0)).toHaveClass(/fait/, { timeout: 5_000 })
  await ouvrirCatalogueParcours(page)
  await page.locator('.liste-pp .ligne-pp').nth(3).click()
  await spotlightSur(page, '[data-tour="carte-1Coordinatrice"] .crayon')
  await expect(page.locator('[data-tour="carte-1Coordinatrice"]')).toContainText('1Coordinatrice')
  await expect(page.locator('.carte-ent').first()).toContainText('Entretien préparatoire')

  await app.close()
})
