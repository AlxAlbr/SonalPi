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

test('le volet Notes coexiste avec les onglets et conserve le brouillon', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-brouillon-note-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await entrerEntretien(page)

  const transcription = page.locator('.colonne-droite')
  const largeurFermee = (await transcription.boundingBox())!.width
  const languette = page.locator('.onglets button[data-onglet="notes"]')
  const panneauNotes = page.locator('.panneau.notes')
  const voletNotes = page.locator('.volet-notes')
  const verifierPositionLanguette = async () => {
    const position = await page.evaluate(() => {
      const volet = document.querySelector('.volet-notes')!.getBoundingClientRect()
      const languette = document.querySelector('.notes-languette button')!.getBoundingClientRect()
      return {
        centreVolet: volet.y + volet.height / 2,
        centreLanguette: languette.y + languette.height / 2,
        basLanguette: languette.bottom,
        hauteurFenetre: window.innerHeight,
        bordBas: getComputedStyle(document.querySelector('.notes-languette button')!).borderBottomWidth,
        rayons: [
          getComputedStyle(document.querySelector('.notes-languette button')!).borderTopLeftRadius,
          getComputedStyle(document.querySelector('.notes-languette button')!).borderTopRightRadius,
          getComputedStyle(document.querySelector('.notes-languette button')!).borderBottomRightRadius,
          getComputedStyle(document.querySelector('.notes-languette button')!).borderBottomLeftRadius,
        ],
      }
    })
    expect(Math.abs(position.centreLanguette - position.centreVolet)).toBeLessThan(2)
    expect(position.basLanguette).toBeLessThanOrEqual(position.hauteurFenetre)
    expect(position.bordBas).toBe('1px')
    expect(position.rayons).toEqual(['6px', '6px', '6px', '6px'])
  }
  await verifierPositionLanguette()
  await expect(panneauNotes).toBeVisible()
  await expect(panneauNotes.locator('.corpus-tete')).toBeHidden()
  const bordReplie = await page.evaluate(() => {
    const panneau = document.querySelector('.panneau.notes')!.getBoundingClientRect()
    const languette = document.querySelector('.notes-languette button')!.getBoundingClientRect()
    return {
      panneauGauche: panneau.left,
      panneauDroite: panneau.right,
      centreLanguette: languette.left + languette.width / 2,
      largeurFenetre: window.innerWidth,
      espaceEditeur: panneau.left - document.querySelector('.colonne-droite')!.getBoundingClientRect().right,
      rayonHautGauche: getComputedStyle(document.querySelector('.panneau.notes')!).borderTopLeftRadius,
    }
  })
  expect(Math.abs(bordReplie.panneauGauche - bordReplie.centreLanguette)).toBeLessThan(2)
  expect(bordReplie.panneauGauche).toBeLessThan(bordReplie.largeurFenetre)
  expect(bordReplie.panneauDroite).toBeGreaterThan(bordReplie.largeurFenetre)
  expect(bordReplie.rayonHautGauche).toBe('8px')
  await languette.click()
  await expect.poll(async () => (await transcription.boundingBox())!.width).toBeLessThan(largeurFermee)
  const largeurPanneauOuvert = await page.evaluate(() => Math.round(Math.min(360, window.innerWidth * 0.34)))
  await expect.poll(async () => Math.round((await panneauNotes.boundingBox())!.width)).toBe(largeurPanneauOuvert)
  await expect(page.locator('.onglets button[data-onglet="maison"]')).toHaveClass(/actif/)
  await expect(panneauNotes).toBeVisible()
  await verifierPositionLanguette()
  const geometrie = await page.evaluate(() => {
    const examiner = (element: Element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return { x: rect.x, width: rect.width, height: rect.height, display: style.display, position: style.position, left: style.left, order: style.order, marginRight: style.marginRight, rayonHautGauche: style.borderTopLeftRadius }
    }
    return {
      volet: examiner(document.querySelector('.volet-notes')!),
      panneau: examiner(document.querySelector('.panneau.notes')!),
      languette: examiner(document.querySelector('.notes-languette')!),
      bouton: examiner(document.querySelector('[data-onglet="notes"]')!),
      espaceEditeur: document.querySelector('.panneau.notes')!.getBoundingClientRect().left - document.querySelector('.colonne-droite')!.getBoundingClientRect().right,
    }
  })
  expect(geometrie.bouton.x).toBeLessThan(geometrie.panneau.x)
  expect(geometrie.bouton.x + geometrie.bouton.width).toBeGreaterThan(geometrie.panneau.x)
  expect(Math.abs(geometrie.panneau.height - geometrie.volet.height)).toBeLessThan(2)
  expect(geometrie.panneau.rayonHautGauche).toBe('8px')
  expect(Math.abs(geometrie.espaceEditeur - bordReplie.espaceEditeur)).toBeLessThan(2)
  await page.locator('.champ-titre-note input').fill('Titre en cours')
  await page.locator('.zone-corps-note').fill('Corps en cours')

  await page.locator('.onglets button[data-onglet="locuteurs"]').dispatchEvent('click')
  await expect(page.locator('.onglets button[data-onglet="locuteurs"]')).toHaveClass(/actif/)
  await expect(panneauNotes).toBeVisible()
  await languette.dispatchEvent('click')
  await expect(panneauNotes.locator('.corpus-tete')).toBeHidden()
  await languette.dispatchEvent('click')
  await expect(panneauNotes.locator('.corpus-tete')).toBeVisible()

  await expect(page.locator('.champ-titre-note input')).toHaveValue('Titre en cours')
  await expect(page.locator('.zone-corps-note')).toHaveText('Corps en cours')
  await page.locator('.creer-note-inline').click()
  await expect(page.locator('.carte-note')).toContainText('Titre en cours')
  await expect(page.locator('.champ-titre-note input')).toHaveValue('')
  await expect(page.locator('.zone-corps-note')).toHaveText('')
  await app.close()
})

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
  const formulaire = page.locator('.nouvelle-note-inline')
  await page.locator('.zone-corps-note').click()
  await page.keyboard.type('Une note de terrain importante pour la demonstration')
  await formulaire.getByRole('button', { name: 'Créer une note', exact: true }).click()
  await expect(page.locator('.carte-note')).toHaveCount(1)
  await expect(formulaire.locator('.champ-titre-note input')).toHaveValue('')
  await expect(formulaire.locator('.zone-corps-note')).toHaveText('')

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

  const languette = page.locator('.onglets button[data-onglet="notes"]')
  await languette.click()
  await expect(page.locator('.panneau.notes .corpus-tete')).toBeHidden()
  await page.locator('.onglets button[data-onglet="maison"]').click()
  await page.locator('.liste-tours button').first().click()
  await expect(page.locator('.panneau.notes .corpus-tete')).toBeVisible()

  await app.close()
})
