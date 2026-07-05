import { test, expect, type Page } from '@playwright/test'
import { ouvrir, coderTheme } from './util'

/**
 * ÉTAPE 1 — le marquage devient visible (décorations projetées depuis le modèle).
 * Critères DEMARRAGE : (1) surlignage visible et qui suit l'édition ; (2) deux
 * thèmes superposés se composent ; (3) plage supprimée → orpheline (au modèle) et
 * plus de surlignage ; + le toggle « re-coder = retirer ».
 */

/** Pose un caret au tout début (snap → 1er mot « Karine »), puis code en cliquant
 *  le thème dans l'onglet Thématique (S3). Thèmes seed : Famille/Travail/Lieu. */
async function coderPremierMot(page: Page, nomTheme: string) {
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, nomTheme)
}

test('coder surligne le passage (décoration), et le surlignage suit l’édition', async () => {
  const { app, page } = await ouvrir('sonal-mq-')
  const ed = page.locator('.editeur')

  await coderPremierMot(page, 'Lieu')

  // Surlignage présent sur « Karine » (décoration = span .annot).
  const annot = ed.locator('.annot')
  await expect(annot).toHaveText('Karine')
  await expect(page.locator('.debug li')).toHaveCount(1)

  // Édite en fin de doc : le surlignage reste sur « Karine » (positions suivies).
  await ed.click({ position: { x: 40, y: 260 } })
  await page.keyboard.type(' AJOUT')
  await expect(ed).toContainText('AJOUT')
  await expect(ed.locator('.annot')).toHaveText('Karine')

  await app.close()
})

test('deux thèmes sur la même plage se composent (annotations superposées)', async () => {
  const { app, page } = await ouvrir('sonal-mq-')
  const ed = page.locator('.editeur')

  // Même sélection (caret au début → snap « Karine »), deux thèmes différents.
  await coderPremierMot(page, 'Famille')
  await coderPremierMot(page, 'Travail')

  // Modèle : deux codages, tous deux sur « Karine ».
  const lignes = page.locator('.debug li')
  await expect(lignes).toHaveCount(2)
  await expect(lignes.nth(0).locator('.extrait')).toHaveText('« Karine »')
  await expect(lignes.nth(1).locator('.extrait')).toHaveText('« Karine »')
  // Rendu : UN segment couvrant « Karine », porteur des DEUX codages empilés
  // (fonds superposés + deux soulignés) → composition visible.
  const annot = ed.locator('.annot')
  await expect(annot).toHaveText('Karine')
  await expect(annot).toHaveAttribute('data-annot-count', '2')
  const style = (await annot.getAttribute('style')) ?? ''
  expect((style.match(/inset/g) ?? []).length).toBe(2) // deux soulignés empilés

  await app.close()
})

test('re-coder la même sélection retire le codage (toggle)', async () => {
  const { app, page } = await ouvrir('sonal-mq-')
  const ed = page.locator('.editeur')

  await coderPremierMot(page, 'Famille')
  await expect(page.locator('.debug li')).toHaveCount(1)
  await expect(ed.locator('.annot')).toHaveCount(1)

  // Re-coder à l'identique (le caret n'a pas bougé) → retire (toggle D-S6).
  await coderTheme(page, 'Famille')
  await expect(page.locator('.debug li')).toHaveCount(0)
  await expect(ed.locator('.annot')).toHaveCount(0)

  await app.close()
})

test('supprimer le passage codé → annotation orpheline, plus de surlignage', async () => {
  const { app, page } = await ouvrir('sonal-mq-')
  const ed = page.locator('.editeur')

  await coderPremierMot(page, 'Lieu')
  await expect(ed.locator('.annot')).toHaveCount(1)

  // Efface tout le texte : la plage codée disparaît → l'annotation se referme.
  await ed.click()
  await ed.press('ControlOrMeta+a')
  await ed.press('Backspace')

  // Conservée au modèle mais marquée orpheline, et plus aucune décoration.
  await expect(page.locator('.debug li')).toHaveCount(1)
  await expect(page.locator('.debug li.orph')).toBeVisible()
  await expect(page.locator('.debug .tag-orph')).toHaveText('orpheline')
  await expect(ed.locator('.annot')).toHaveCount(0)

  await app.close()
})
