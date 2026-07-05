import { test, expect } from '@playwright/test'
import { ouvrir, coderTheme } from './util'

/**
 * SMOKE e2e (étape 0) — pilote la VRAIE app Electron, pas le build : prouve que
 * (1) la fenêtre s'ouvre et l'éditeur monte avec le schéma D2 (blocs data-loc),
 * (2) coder une sélection ajoute une annotation au MODÈLE (panneau debug),
 * (3) le plugin de remap est câblé et tourne sur de vrais coups de clavier.
 *
 * Remplace le proxy faible « le build passe » par une preuve que la fenêtre vit.
 */
test('la fenêtre s’ouvre, l’éditeur monte avec le schéma D2 (blocs data-loc)', async () => {
  const { app, page } = await ouvrir()

  // Le texte seed est là, sur deux blocs porteurs de leur locuteur (attribut D2).
  await expect(page.locator('.editeur')).toContainText('travail')
  await expect(page.locator('.editeur p[data-loc="1"]')).toBeVisible()
  await expect(page.locator('.editeur p[data-loc="2"]')).toBeVisible()
  // Panneau debug présent, modèle vide au départ.
  await expect(page.locator('.debug .vide')).toBeVisible()

  await app.close()
})

test('coder une sélection ajoute une annotation au modèle, la retirer l’enlève', async () => {
  const { app, page } = await ouvrir()
  const ed = page.locator('.editeur')

  await ed.click()
  await ed.press('ControlOrMeta+a')
  await coderTheme(page, 'Famille') // cat_001

  const lignes = page.locator('.debug li')
  await expect(lignes).toHaveCount(1)
  await expect(lignes.first().locator('.l1 code')).toHaveText('cat_001')
  await expect(lignes.first().locator('.pos')).toBeVisible()

  await lignes.first().locator('.x').click()
  await expect(page.locator('.debug li')).toHaveCount(0)
  await expect(page.locator('.debug .vide')).toBeVisible()

  await app.close()
})

test('le plugin de remap tourne dans la vraie app : une édition ne casse pas l’annotation', async () => {
  // NB : l'exhaustivité du remapping (insert avant/dans/après/bornes, suppression,
  // undo, split) est déjà prouvée par les 12 tests unitaires. Ce smoke prouve
  // seulement que le plugin est CÂBLÉ dans l'app réelle et tourne sur de vrais
  // coups de clavier — via une édition déterministe (append en fin de doc).
  const { app, page } = await ouvrir()
  const ed = page.locator('.editeur')

  // Pose un caret collapsé au tout début (clic en haut-gauche) : le snap-to-mot
  // étend la sélection vide au 1er mot → on code précisément « Karine ».
  await ed.click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Famille')
  const ligne = page.locator('.debug li').first()
  await expect(ligne).toHaveCount(1)
  await expect(ligne.locator('.extrait')).toHaveText('« Karine »')

  // Édite LOIN de l'annotation : caret en fin de doc (clic dans l'espace vide
  // sous le texte → fin, sans ambiguïté de sélection), puis frappe.
  await ed.click({ position: { x: 40, y: 260 } })
  await page.keyboard.type(' AJOUT')

  // Le texte a bien été inséré, et l'annotation « Karine » (loin devant) est
  // intacte : le plugin a remappé sur un vrai coup de clavier sans la casser.
  await expect(ed).toContainText('AJOUT')
  await expect(page.locator('.debug li')).toHaveCount(1) // pas de perte
  await expect(ligne).not.toHaveClass(/orph/) // pas devenue orpheline
  await expect(ligne.locator('.extrait')).toHaveText('« Karine »') // plage intacte

  await app.close()
})
