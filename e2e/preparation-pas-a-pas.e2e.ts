import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attendreAccueil, lancer, spotlightSur } from './util'
import { choisirDossierExemple, preparerApprentissage } from './exemples-util'

async function ouvrirCatalogueParcours(page: import('@playwright/test').Page): Promise<void> {
  if (await page.locator('.voile-catalogue-parcours').isVisible()) return
  const suivi = page.getByTestId('resume-parcours-global')
  if (await suivi.isVisible()) {
    await suivi.getByRole('button', { name: 'Voir les étapes ou changer de parcours' }).click()
  } else {
    await page.locator('.carte-demo.parcours').click()
  }
  await expect(page.locator('.voile-catalogue-parcours')).toBeVisible()
}

test('Préparer et suivre utilise un corpus vierge distinct de celui du Traitement', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-preparation-'))
  const sources = mkdtempSync(join(tmpdir(), 'sonal-preparation-sources-'))
  const corpus = mkdtempSync(join(tmpdir(), 'sonal-preparation-corpus-'))
  const corpusTraitement = mkdtempSync(join(tmpdir(), 'sonal-traitement-corpus-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await preparerApprentissage(app, page, sources, corpus, 'preparation')
    await expect(page.locator('.carte-parcours')).toHaveCount(4)
    await expect(page.locator('.liste-pp li')).toHaveCount(4)
    await expect(page.locator('.liste-pp li').first()).not.toHaveClass(/fait/)
    await expect(page.locator('.espace-preparation')).toBeVisible()

    await spotlightSur(page, '[data-tour="ouvrir-tableau-bord"]')
    await page.locator('[data-tour="ouvrir-tableau-bord"]').click()
    await expect(page.getByTestId('consigne-pas-a-pas')).toBeVisible()
    await spotlightSur(page, '[data-tour="cellule-problematique"]')
    await page.locator('[data-tour="cellule-problematique"]').click()
    await page.locator('[data-tour="note-cellule-tableau"]').fill('Comment évolue l’aide aux devoirs ?')
    await page.locator('[data-tour="appliquer-cellule-tableau"]').click()
    await expect(page.locator('.liste-pp li').nth(0)).toHaveClass(/fait/)

    await ouvrirCatalogueParcours(page)
    await page.locator('.liste-pp .ligne-pp').nth(1).click()
    await spotlightSur(page, '[data-tour="ouvrir-docs-cadre"]')
    await page.getByRole('button', { name: 'Mettre le guide en pause', exact: true }).click()
    const suiviParcours = page.getByTestId('resume-parcours-global')
    await expect(suiviParcours.locator('.resume-titre')).toHaveText('Démo : Préparer et suivre')
    await expect(suiviParcours).toContainText('Étape à reprendre : Ajouter les documents du projet')
    await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await expect(suiviParcours).toContainText('Ajouter les documents du projet')
    await page.getByRole('button', { name: 'Analyser et interpréter', exact: true }).click()
    await expect(suiviParcours).toBeVisible()
    await page.getByRole('button', { name: 'Organiser et exporter', exact: true }).click()
    await expect(suiviParcours).toBeVisible()
    await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Parcours pas à pas', exact: true })).toHaveCount(0)
    await suiviParcours.getByRole('button', { name: 'Reprendre le parcours' }).click()
    await spotlightSur(page, '[data-tour="ouvrir-preparer"]')
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    await spotlightSur(page, '[data-tour="ouvrir-docs-cadre"]')
    await page.locator('[data-tour="ouvrir-docs-cadre"]').click()
    await expect(page.getByRole('button', { name: 'Ouvrir le dossier du guide d’entretien' })).toBeVisible()
    await app.evaluate(({ dialog }, chemin) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
    }, join(sources, 'docs', 'Guide-entretien-demo.txt'))
    await page.locator('[data-tour="ajouter-document-cadre"]').click()
    await expect(page.locator('.liste-pp li').nth(1)).toHaveClass(/fait/)

    await ouvrirCatalogueParcours(page)
    await page.locator('.liste-pp .ligne-pp').nth(2).click()
    await page.locator('[data-tour="ajouter-entretien"]').click()
    await page.locator('[data-tour="titre-entretien-vide"]').fill('Entretien préparatoire')
    await page.locator('.modale-ajout [data-tour="valider"]').click()
    await expect(page.locator('.liste-pp li').nth(2)).toHaveClass(/fait/)
    await expect(page.locator('.carte-ent', { hasText: 'Entretien préparatoire' })).toBeVisible()

    await ouvrirCatalogueParcours(page)
    await page.locator('.liste-pp .ligne-pp').nth(3).click()
    await page.locator('.carte-ent', { hasText: 'Entretien préparatoire' }).locator('.crayon').click()
    await page.locator('[data-tour="onglet-notes"]').click()
    await page.locator('[data-tour="note-titre"]').fill('Avant l’entretien')
    await page.locator('.nouvelle-note-inline .zone-corps-note').click()
    await page.keyboard.type('Demander comment les familles découvrent le dispositif.')
    await page.locator('[data-tour="creer-note"]').click()
    await expect(page.locator('.fini-pp')).toBeVisible()
    await expect(page.locator('.rappel-parcours')).toHaveCount(0)
    await expect(page.getByTestId('resume-parcours-global')).toContainText('Préparer et suivre')

    await ouvrirCatalogueParcours(page)
    await page.locator('.carte-parcours').filter({ hasText: 'Importer et traiter' }).click()
    await choisirDossierExemple(app, corpusTraitement)
    await page.getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
    await expect(page.locator('.installation-exemple')).toBeVisible()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
    await app.evaluate(({ dialog }, fichiers) => {
      let index = 0
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [index++ === 0 ? fichiers.srt : fichiers.audio] })
    }, { srt: join(sources, 'srt', '1Coordinatrice.srt'), audio: join(sources, 'audio', '1Coordinatrice.mp3') })
    await page.locator('[data-tour="ajouter-entretien"]').click()
    await page.locator('[data-tour="zone-texte"]').click()
    await page.locator('[data-tour="zone-audio"]').click()
    await page.locator('.modale-ajout [data-tour="valider"]').click()
    await expect(page.locator('.liste-pp li').nth(0)).toHaveClass(/fait/)
    await ouvrirCatalogueParcours(page)
    await page.locator('.liste-pp .ligne-pp').nth(3).click()
    await spotlightSur(page, '[data-tour="carte-1Coordinatrice"] .crayon')
    await expect(page.locator('.carte-ent')).toHaveCount(1)
    await expect(page.locator('.carte-ent').first()).toContainText('1Coordinatrice')
    expect(Object.values(JSON.parse(readFileSync(join(corpus, 'corpus.json'), 'utf8')).membership)
      .some((entretien: any) => entretien.titre === 'Entretien préparatoire')).toBe(true)
    await page.getByRole('button', { name: 'Mettre le guide en pause', exact: true }).click()
    await page.getByTestId('resume-parcours-global').getByRole('button', { name: 'Sortir de la démo' }).click()
    await expect(page.locator('.accueil')).toBeVisible()
    await expect(page.getByTestId('resume-parcours-global')).toHaveCount(0)
  } finally { await app.close() }
})
