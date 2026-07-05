import { test, expect, type Page } from '@playwright/test'
import { ouvrir, ouvrirSurCorpus, retourCorpus, coderTheme } from './util'

/**
 * ÉTAPE 5 + S2 + S3 — thèmes GÉRÉS à l'écran CORPUS (CRUD/couleur/ordre/suppression)
 * tandis que le CODAGE se fait à l'écran Entretien via l'onglet Thématique (clic =
 * coder — S3). Invariants : (1) recolorer se reflète en direct SANS écrire dans
 * l'entretien ; (2) cliquer un thème code la sélection ; (3) supprimer un thème
 * utilisé = refus + compteur.
 */

/** Code le 1er mot (curseur au début → snap « Karine ») avec « Famille » (cat_001). */
async function coderPremierMot(page: Page) {
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Famille')
}

test('recolorer un thème (écran Corpus) se reflète en direct sur le codage, sans re-sauver', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  await coderPremierMot(page) // code cat_001 sur « Karine » (écran Entretien)
  await expect(page.locator('.debug li')).toHaveCount(1)
  await expect(page.locator('.etat')).toHaveText('à jour') // autosave terminé

  // Retour Corpus, recolore cat_001 (1er swatch) en rouge (fill dispatche input+change).
  await retourCorpus(page)
  await page.locator('.swatch').first().fill('#ff0000')

  // Le surlignage suit (résolution par id, l'éditeur reste monté), et l'entretien
  // N'A PAS été re-sauvé par le recoloriage (éditer une définition ≠ un entretien).
  await expect(page.locator('.editeur .annot')).toHaveAttribute('style', /rgb\(255, 0, 0\)/)
  await expect(page.locator('.etat')).toHaveText('à jour')
  await app.close()
})

test('cliquer un thème dans l’onglet Thématique code la sélection (clic = coder)', async () => {
  const { app, page } = await ouvrir('sonal-thm-')

  // Sélection (caret au début → snap « Karine »), puis clic sur « Travail » (cat_002).
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Travail')
  await expect(page.locator('.debug li code').first()).toHaveText('cat_002')
  await app.close()
})

test('double-cliquer un thème permet de le renommer', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-thm-')
  await page.locator('.liste-thm li', { hasText: 'Famille' }).locator('.nom-thm-label').dblclick()
  const champ = page.locator('.liste-thm li .nom-thm')
  await champ.fill('Famille élargie')
  await champ.press('Enter')
  await expect(page.locator('.liste-thm li').first()).toContainText('Famille élargie')
  await app.close()
})

test('une annotation à cheval sur deux blocs reste UNE entité (debug)', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  const ed = page.locator('.editeur')

  // Tout sélectionner (le seed = 2 blocs) puis coder → UNE seule annotation qui
  // enjambe les deux blocs (l'Extraits UI est retiré — D-S7 ; on vérifie
  // l'invariant « le codage enjambe » via l'extrait du panneau debug).
  await ed.click()
  await ed.press('ControlOrMeta+a')
  await coderTheme(page, 'Famille')

  await expect(page.locator('.debug li')).toHaveCount(1)
  const li = page.locator('.debug li').first()
  await expect(li.locator('.extrait')).toContainText('retraite') // bloc 1
  await expect(li.locator('.extrait')).toContainText('Elle parle') // bloc 2
  await app.close()
})

test('créer un sous-thème → apparaît indenté sous son parent (hiérarchie D-S8)', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-hier-')

  // « + sous » sur « Famille » (thème racine, ordre 0).
  await page.locator('.liste-thm li', { hasText: 'Famille' }).first().locator('.mini-sous').click()

  // Un sous-thème apparaît, indenté (profondeur 1 → padding-left 1.1rem inline).
  const sous = page.locator('.liste-thm li', { hasText: 'Nouveau sous-thème' })
  await expect(sous).toHaveCount(1)
  await expect(sous).toHaveAttribute('style', /padding-left:\s*1\.1rem/)
  // Le thème racine « Famille » reste à plat (padding-left 0rem).
  await expect(page.locator('.liste-thm li', { hasText: 'Famille' }).first()).toHaveAttribute(
    'style',
    /padding-left:\s*0rem/,
  )
  await app.close()
})

test('supprimer un thème utilisé est refusé avec un compteur ; un thème inutilisé part', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  await coderPremierMot(page) // cat_001 utilisé 1×
  await expect(page.locator('.etat')).toHaveText('à jour') // sur disque → compte fiable

  await retourCorpus(page)
  // Supprimer cat_001 (utilisé) → refus + compteur, toujours 3 thèmes.
  await page.locator('.liste-thm li').first().locator('.x').click()
  await expect(page.locator('.msg-thm')).toContainText('utilisé 1')
  await expect(page.locator('.liste-thm li')).toHaveCount(3)

  // Supprimer cat_003 (inutilisé) → retiré.
  await page.locator('.liste-thm li').nth(2).locator('.x').click()
  await expect(page.locator('.liste-thm li')).toHaveCount(2)
  await app.close()
})
