import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, entrerEntretien, selectionner } from './util'

/**
 *  Liaison d'un passage d'une note de la FEUILLE à un commentaire : création
 *  d'un commentaire dans l'éditeur, puis (onglet Notes, vue feuille)
 *  sélection dans le bloc → bouton 🔗 → le menu propose le commentaire ; au
 *  choix, le passage est lié (`<em>` + référence) dans la note.
 *
 *  Régression : le menu de liaison était jadis rendu DANS le sous-arbre de la
 *  modale (v-if brouillonNote), invisible donc depuis la feuille.
 */

async function clicDroitSelection(page: Page) {
  const centre = await page.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
}

/** Sélectionne les `n` premiers caractères du i-ème bloc de la feuille. */
async function selectionnerBloc(page: Page, n: number, i = 0) {
  await page.evaluate(
    ([nb, idx]) => {
      const bloc = document.querySelectorAll('.corps-notes-texte')[idx!] as HTMLElement
      if (!bloc) throw new Error('bloc introuvable')
      bloc.focus()
      const walker = document.createTreeWalker(bloc, NodeFilter.SHOW_TEXT)
      const node = walker.nextNode()
      if (!node) throw new Error('aucun texte dans le bloc')
      const range = document.createRange()
      range.setStart(node, 0)
      range.setEnd(node, Math.min(nb, (node.textContent ?? '').length))
      const sel = window.getSelection()!
      sel.removeAllRanges()
      sel.addRange(range)
    },
    [n, i],
  )
}

test('feuille — lier un passage de note à un commentaire', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-feuille-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await entrerEntretien(page)

  // 1. Un commentaire existe dans l'entretien.
  await selectionner(page, 'Karine')
  await clicDroitSelection(page)
  await page.getByRole('menuitem', { name: /Commenter/ }).click()
  await page.locator('[data-test="commentaire-auteur"]').fill('Karine D.')
  await page.locator('[data-test="commentaire-texte"]').fill('Vérifier cette graphie')
  await page.locator('[data-test="commentaire-valider"]').click()
  await expect(page.locator('.carte-commentaire').first()).toBeVisible()

  // 2. Onglet Notes → créer une note avec du texte.
  await page.locator('.onglets button[data-onglet="notes"]').click()
  await page.locator('button.mini', { hasText: '+ Note' }).click()
  await expect(page.locator('.modale-note-fenetre')).toBeVisible()
  await page.locator('.zone-corps-note').click()
  await page.keyboard.type('Une note de terrain importante pour la demonstration')
  await page.locator('.modale-note-pied .principal').click()
  await expect(page.locator('.carte-note')).toHaveCount(1)

  // 3. Vue feuille : sélection dans le bloc, puis bouton Lier.
  await page.locator('.notes-outils button[title*="Vue feuille"]').click()
  await expect(page.locator('.corps-notes-texte')).toHaveCount(1)
  await selectionnerBloc(page, 12)
  await page.locator('.notes-texte .barre-outils-note button', { hasText: 'Lier à un commentaire' }).click()

  // 4. Le menu propose le commentaire créé ; on lie.
  const menu = page.locator('.menu-liens-note')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: /Lier à « Karine D/ }).click()

  // 5. Le passage lié porte l'em ET sa référence cliquable.
  await expect(page.locator('.corps-notes-texte em')).toBeVisible()
  await expect(page.locator('.corps-notes-texte .ref-note-commentaire')).toContainText('Karine')

  // 6. La liaison persiste dans la note (vue cartes aussi).
  await page.locator('.notes-outils button[title*="Vue cartes"]').click()
  await expect(page.locator('.carte-note .corps-note em')).toBeVisible()

  await app.close()
})
