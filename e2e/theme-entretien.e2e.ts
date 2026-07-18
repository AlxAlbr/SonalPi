import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ouvrir,
  retourCorpus,
  entrerEntretien,
  coderTheme,
  ajouterParModale,
  ouvrirEditionThemes,
  fermerEditionThemes,
} from './util'

/**
 * D-S10 (+ S8 : via la fenêtre EditionThemes) — créer / supprimer un thème DEPUIS
 * l'écran Entretien : le crayon de l'onglet Thématique ouvre la MÊME fenêtre que
 * l'écran Corpus. Créer écrit le codebook corpus (visible partout). Supprimer :
 * refusé si un AUTRE entretien l'utilise ; sinon confirmation (acte destructif) →
 * retrait des codages de CET entretien (modèle=vérité) + suppression de la
 * définition (store).
 */

test('créer un thème depuis l’entretien (fenêtre d’édition) → apparaît, prêt à coder', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  await ouvrirEditionThemes(page)
  await page.locator('.modale-themes .mini', { hasText: '+ Thème' }).click()
  await expect(page.locator('.liste-thm li[data-nom="Nouveau thème"]')).toHaveCount(1)
  await fermerEditionThemes(page)
  await expect(page.locator('.theme-coder', { hasText: 'Nouveau thème' })).toHaveCount(1)
  await app.close()
})

test('supprimer un thème depuis l’entretien : confirmation + retrait des codages', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // Coder « Lieu » sur « Karine ».
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.editeur .annot')).toHaveCount(1)

  // ✕ sur « Lieu » (fenêtre d'édition) → confirmation annonçant 1 codage retiré.
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  await expect(page.locator('.confirm-suppr')).toContainText('1 codage')
  await page.locator('.confirm-suppr .danger').click()
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveCount(0)
  await fermerEditionThemes(page)

  // Le thème a disparu de la liste de codage ET son codage est retiré du modèle.
  await expect(page.locator('.theme-coder', { hasText: 'Lieu' })).toHaveCount(0)
  await expect(page.locator('.editeur .annot')).toHaveCount(0)
  await app.close()
})

test('supprimer depuis l’entretien un thème utilisé par un AUTRE entretien → refusé', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // e1 (seed) : coder « Lieu », enregistrer.
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.etat')).toHaveText('à jour')

  // Nouvel entretien e2 (petit .txt importé via la modale) : coder « Lieu » aussi.
  const txt = join(mkdtempSync(join(tmpdir(), 'sonal-ds10-fix-')), 'second.txt')
  writeFileSync(txt, 'Un second entretien à coder.\n')
  await app.evaluate(({ dialog }, chemin) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chemin] })
  }, txt)
  await retourCorpus(page)
  await ajouterParModale(page, ['texte'])
  await expect(page.locator('.editeur')).toContainText('Un second entretien à coder.')
  await page.locator('.editeur').click()
  await page.locator('.editeur').press('ControlOrMeta+a')
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.etat')).toHaveText('à jour')

  // Retour, rouvrir e1 (1er de la liste), tenter de supprimer « Lieu » → refus
  // affiché DANS la fenêtre d'édition.
  await retourCorpus(page)
  await entrerEntretien(page, 0)
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  await expect(page.locator('.modale-themes .msg-thm')).toContainText('1 autre')
  // Pas de confirmation ouverte, le thème est toujours là.
  await expect(page.locator('.confirm-suppr')).toHaveCount(0)
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveCount(1)
  await app.close()
})
