import { test, expect } from '@playwright/test'
import { ouvrir, retourCorpus, entrerEntretien, coderTheme } from './util'

/**
 * D-S10 — créer / supprimer un thème DEPUIS l'écran Entretien (onglet Thématique).
 * Créer écrit le codebook corpus (visible partout). Supprimer : refusé si un AUTRE
 * entretien l'utilise ; sinon confirmation (acte destructif) → retrait des codages
 * de CET entretien (modèle=vérité) + suppression de la définition (store).
 */

test('créer un thème depuis l’entretien (+ Thème) → apparaît, prêt à coder', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  await page.locator('.themes-coder .mini', { hasText: '+ Thème' }).click()
  await expect(page.locator('.theme-coder', { hasText: 'Nouveau thème' })).toHaveCount(1)
  await app.close()
})

test('supprimer un thème depuis l’entretien : confirmation + retrait des codages', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // Coder « Lieu » sur « Karine ».
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.debug li')).toHaveCount(1)

  // ✕ sur « Lieu » → confirmation annonçant 1 codage retiré (irréversible).
  await page.locator('.ligne-coder', { hasText: 'Lieu' }).locator('.x-theme').click()
  await expect(page.locator('.confirm-suppr')).toContainText('1 codage')
  await page.locator('.confirm-suppr .danger').click()

  // Le thème a disparu de la liste ET son codage est retiré du modèle.
  await expect(page.locator('.theme-coder', { hasText: 'Lieu' })).toHaveCount(0)
  await expect(page.locator('.debug li')).toHaveCount(0)
  await app.close()
})

test('supprimer depuis l’entretien un thème utilisé par un AUTRE entretien → refusé', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // e1 (seed) : coder « Lieu », enregistrer.
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.etat')).toHaveText('à jour')

  // Nouvel entretien e2 : y taper du texte et coder « Lieu » aussi.
  await retourCorpus(page)
  await page.locator('.corpus-tete .mini', { hasText: '+ Nouveau' }).click()
  await expect(page.locator('.editeur')).toBeVisible()
  await page.locator('.editeur').click()
  await page.keyboard.type('Un second entretien à coder.')
  await page.locator('.editeur').press('ControlOrMeta+a')
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.etat')).toHaveText('à jour')

  // Retour, rouvrir e1 (1er de la liste), tenter de supprimer « Lieu » → refus.
  await retourCorpus(page)
  await entrerEntretien(page, 0)
  await page.locator('.ligne-coder', { hasText: 'Lieu' }).locator('.x-theme').click()
  await expect(page.locator('.hint-codage')).toContainText('1 autre')
  // Pas de confirmation ouverte, le thème est toujours là.
  await expect(page.locator('.confirm-suppr')).toHaveCount(0)
  await expect(page.locator('.theme-coder', { hasText: 'Lieu' })).toHaveCount(1)
  await app.close()
})
