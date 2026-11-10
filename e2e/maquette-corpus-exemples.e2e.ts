import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(join(process.cwd(), 'plans/maquettes/corpus-exemples-interface.html'), 'utf8')
const catalogue = (page: Page) => page.getByRole('dialog', { name: 'Choisir un parcours pas à pas' })
const preparation = (page: Page) => page.locator('#preparation')

async function ouvrirParcours(page: Page, situation = 'neuf'): Promise<void> {
  await page.locator('#scenario').selectOption(situation)
  await page.getByRole('button', { name: 'Parcours pas à pas', exact: false }).click()
}

async function choisirTraitement(page: Page): Promise<void> {
  await catalogue(page).getByRole('button', { name: /^Importer et traiter/ }).click()
}

test.beforeEach(async ({ page }) => {
  await page.setContent(html)
})

test('le catalogue se limite aux étapes, à l’action principale et à la remise à zéro', async ({ page }) => {
  await ouvrirParcours(page, 'encours')
  await expect(catalogue(page).locator('.corpus-exercice')).toHaveCount(0)
  await expect(catalogue(page).locator('#choix-copie')).toHaveCount(0)
  await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo', exact: true })).toBeVisible()
  const ordre = await page.evaluate(() => {
    const etapes = document.getElementById('etapes')!
    const action = document.getElementById('action-parcours')!
    return Boolean(etapes.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(ordre).toBe(true)
})

test('Préparer et suivre fait choisir l’emplacement avant la première étape', async ({ page }) => {
  await ouvrirParcours(page)
  await expect(catalogue(page).locator('#etapes li')).toHaveCount(4)
  await expect(catalogue(page).locator('#etapes li').first()).toHaveText('Organiser le suivi')
  await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
  await expect(preparation(page)).toContainText('Préparer la démo « Préparer et suivre »')
  await expect(page.locator('#courant')).toHaveText('Corpus actif : Mon enquête')
  await page.keyboard.press('Escape')
  await expect(catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true })).toBeFocused()
  await expect(catalogue(page).locator('#progression')).toHaveText('0 étape(s) sur 4.')
  await catalogue(page).getByRole('button', { name: 'Organiser le suivi', exact: true }).click()
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(page.locator('#courant')).toHaveText('Corpus actif : Préparer et suivre')
  await expect(page.locator('#guide')).toContainText('Étape choisie : Organiser le suivi')
  await page.getByRole('button', { name: 'Revenir aux parcours', exact: true }).click()
  await expect(catalogue(page).locator('#progression')).toHaveText('0 étape(s) sur 4.')
  await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo' })).toBeVisible()
})

test('une étape de préparation choisie directement garde sa destination', async ({ page }) => {
  await ouvrirParcours(page)
  await catalogue(page).getByRole('button', { name: 'Ajouter les documents du projet', exact: true }).click()
  await expect(preparation(page)).toContainText('Préparer la démo « Préparer et suivre »')
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Ajouter les documents du projet')
})

test('le corpus de Traitement ne prépare pas la démo de Préparation', async ({ page }) => {
  await ouvrirParcours(page)
  await choisirTraitement(page)
  await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
  await expect(preparation(page)).toBeVisible()
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await page.getByRole('button', { name: 'Revenir aux parcours', exact: true }).click()
  await catalogue(page).getByRole('button', { name: /^Préparer et suivre/ }).click()
  await expect(catalogue(page).locator('#progression')).toHaveText('0 étape(s) sur 4.')
  await catalogue(page).getByRole('button', { name: 'Organiser le suivi', exact: true }).click()
  await expect(preparation(page)).toContainText('Préparer la démo « Préparer et suivre »')
})

test('une préparation échouée ne lance pas le parcours et peut être reprise', async ({ page }) => {
  await ouvrirParcours(page, 'erreur')
  await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(preparation(page).getByRole('alert')).toContainText('Aucun parcours n’a été lancé')
  await expect(page.locator('#courant')).toHaveText('Corpus actif : Mon enquête')
  await preparation(page).getByRole('button', { name: 'Retour aux parcours', exact: true }).click()
  await expect(catalogue(page).locator('#progression')).toHaveText('0 étape(s) sur 4.')
  await catalogue(page).getByRole('button', { name: 'Commencer le parcours', exact: true }).click()
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Organiser le suivi')
})

test('consulter les cartes ne change pas le corpus ; Échap rend le focus à l’accueil', async ({ page }) => {
  await ouvrirParcours(page)
  await choisirTraitement(page)
  await expect(catalogue(page).locator('#etapes li')).toHaveCount(6)
  await expect(preparation(page)).not.toBeVisible()
  await expect(page.locator('#courant')).toHaveText('Corpus actif : Mon enquête')
  await expect(page.locator('#travail')).not.toBeVisible()
  await catalogue(page).getByRole('button', { name: /^Analyser et interpréter/ }).click()
  await expect(catalogue(page).locator('#detail-parcours')).toContainText('Le parcours guidé d’analyse est à venir.')
  await page.keyboard.press('Escape')
  await expect(catalogue(page)).not.toBeVisible()
  await expect(page.locator('#ouvrir-parcours')).toBeFocused()
})

test('une étape choisie passe par la préparation puis démarre cette étape précise', async ({ page }) => {
  await ouvrirParcours(page)
  await choisirTraitement(page)
  await expect(catalogue(page).getByRole('button', { name: 'Lier la transcription', exact: true })).toBeDisabled()
  const etape = catalogue(page).getByRole('button', { name: 'Prendre des notes à chaud', exact: true })
  await etape.click()
  await expect(preparation(page)).toContainText('Préparer la démo « Importer et traiter »')
  await page.keyboard.press('Escape')
  await expect(etape).toBeFocused()
  await expect(page.locator('#courant')).toHaveText('Corpus actif : Mon enquête')
  await etape.click()
  await preparation(page).getByRole('button', { name: 'Modifier…' }).click()
  await preparation(page).getByLabel('Emplacement de votre copie').fill('Documents/Mes exercices')
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Prendre des notes à chaud')
  await expect(page.locator('#statut')).toContainText('Ouverture simulée')
})

test('chaque parcours reprend sa propre démo', async ({ page }) => {
  await ouvrirParcours(page, 'encours')
  await expect(catalogue(page).locator('#detail-parcours')).toContainText('2 étape(s) sur 4')
  await choisirTraitement(page)
  await expect(catalogue(page).locator('#detail-parcours')).toContainText('1 étape(s) sur 6')
  await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo' })).toBeVisible()
  await catalogue(page).getByRole('button', { name: 'Continuer le parcours', exact: true }).click()
  await expect(preparation(page)).not.toBeVisible()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Prendre des notes à chaud')
  await page.getByRole('button', { name: 'Mettre le guide en pause', exact: true }).click()
  const corpusAvant = await page.locator('#courant').textContent()
  await page.getByRole('button', { name: 'Analyser & Interpréter', exact: true }).click()
  await expect(page.locator('#courant')).toHaveText(corpusAvant!)
  await page.getByRole('button', { name: 'Accueil', exact: true }).click()
  await expect(page.locator('#recents')).not.toContainText('Apprentissage')
  await page.locator('#ouvrir-parcours').click()
  await expect(catalogue(page).locator('#detail-parcours')).toContainText('1 étape(s) sur 6')
})

test('l’exemple annoté s’ouvre librement sur Synthèse et se retrouve dans les Récents', async ({ page }) => {
  await page.locator('#ouvrir-exemples').click()
  const choix = page.locator('#cartes-exemples section').filter({ has: page.getByRole('heading', { name: 'Corpus annoté', exact: true }) })
  await choix.getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
  await expect(preparation(page)).toContainText('Préparer « Corpus annoté »')
  await preparation(page).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
  await expect(page.locator('#espace-actif')).toHaveText('Espace : Analyser et interpréter → Synthèse')
  await expect(page.locator('#guide')).toContainText('aucun parcours guidé')
  await expect(page.locator('#repere-analyse')).toBeVisible()
  await page.getByRole('button', { name: 'Accueil', exact: true }).click()
  await expect(page.locator('#recents')).toContainText('Corpus annoté — ma copie')
  await page.locator('#ouvrir-exemples').click()
  await choix.getByRole('button', { name: 'Reprendre mon corpus', exact: true }).click()
  await expect(preparation(page)).not.toBeVisible()
  await expect(page.locator('#espace-actif')).toContainText('Synthèse')
})

test('recommencer remet uniquement la démo choisie au départ', async ({ page }) => {
  await ouvrirParcours(page, 'encours')
  await expect(catalogue(page).locator('#progression')).toHaveText('2 étape(s) sur 4.')
  await catalogue(page).getByRole('button', { name: 'Recommencer cette démo' }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Organiser le suivi')
  await page.getByRole('button', { name: 'Revenir aux parcours' }).click()
  await expect(catalogue(page).locator('#progression')).toHaveText('0 étape(s) sur 4.')
  await choisirTraitement(page)
  await expect(catalogue(page).locator('#progression')).toHaveText('1 étape(s) sur 6.')
})

test('une préparation échouée conserve l’étape choisie et le corpus actif, puis permet de réessayer', async ({ page }) => {
  await ouvrirParcours(page, 'erreur')
  await choisirTraitement(page)
  await catalogue(page).getByRole('button', { name: 'Prendre des notes à chaud', exact: true }).click()
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(preparation(page).getByRole('alert')).toContainText('Aucun parcours n’a été lancé')
  await expect(page.locator('#courant')).toHaveText('Corpus actif : Mon enquête')
  await preparation(page).getByRole('button', { name: 'Préparer et commencer', exact: true }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Prendre des notes à chaud')
})


test('un dossier déplacé se retrouve sans réinitialiser les acquis', async ({ page }) => {
  await ouvrirParcours(page, 'absent')
  await expect(catalogue(page)).toContainText('Nous ne retrouvons plus cette démo')
  await catalogue(page).getByRole('button', { name: 'Retrouver mon dossier…', exact: true }).click()
  await preparation(page).getByRole('button', { name: 'Modifier…' }).click()
  await preparation(page).getByLabel('Emplacement de votre copie').fill('Documents/Exercices déplacés')
  await preparation(page).getByRole('button', { name: 'Retrouver et reprendre', exact: true }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Créer l’entretien préparatoire')
  await page.getByRole('button', { name: 'Revenir aux parcours', exact: true }).click()
  await expect(catalogue(page).locator('#progression')).toHaveText('2 étape(s) sur 4.')
  await expect(catalogue(page).getByRole('button', { name: 'Recommencer cette démo' })).toBeVisible()
})

test('un parcours terminé reste consultable et peut être revu sans remise à zéro', async ({ page }) => {
  await ouvrirParcours(page, 'termine')
  await expect(catalogue(page).locator('#progression')).toHaveText('4 étape(s) sur 4.')
  await catalogue(page).getByRole('button', { name: 'Écrire une note de préparation — revoir', exact: false }).click()
  await expect(page.locator('#guide')).toContainText('Étape choisie : Écrire une note de préparation')
  await page.getByRole('button', { name: 'Revenir aux parcours', exact: true }).click()
  await expect(catalogue(page).locator('#progression')).toHaveText('4 étape(s) sur 4.')
})

test('la maquette reste utilisable au clavier dans une fenêtre étroite', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await ouvrirParcours(page)
  await expect(page.locator('#catalogue-titre')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(catalogue(page).getByRole('button', { name: 'Fermer les parcours', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(catalogue(page).getByRole('button', { name: /^Préparer et suivre/ })).toHaveAttribute('aria-pressed', 'true')
  const deborde = await page.evaluate(() => {
    const dialogue = document.querySelector('dialog[open]')!
    return document.documentElement.scrollWidth > innerWidth || dialogue.scrollWidth > dialogue.clientWidth
  })
  expect(deborde).toBe(false)
  await page.keyboard.press('Escape')
  await expect(page.locator('#ouvrir-parcours')).toBeFocused()
})
