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
  const boutonNotes = page.locator('.outils-editeur button[data-onglet="notes"]')
  const boutonDonnees = page.locator('.outils-editeur button[data-onglet="donnees"]')
  const panneauNotes = page.locator('.panneau.notes')
  const voletNotes = page.locator('.volet-notes')

  // Volet fermé : il ne prend aucune place, le texte occupe toute la largeur.
  await expect(voletNotes).not.toHaveClass(/ouvert/)
  await expect(panneauNotes).toBeHidden()
  await expect.poll(async () => Math.round((await voletNotes.boundingBox())?.width ?? 0)).toBe(0)
  const largeurFermee = (await transcription.boundingBox())!.width

  // Ouverture depuis la barre au-dessus du texte : les onglets de gauche restent en place.
  await boutonNotes.click()
  await expect(boutonNotes).toHaveAttribute('aria-expanded', 'true')
  await expect(panneauNotes.locator('.notes-outils')).toBeVisible()
  await expect(page.locator('.onglets button[data-onglet="locuteurs"]')).toHaveClass(/actif/)
  await expect.poll(async () => (await transcription.boundingBox())!.width).toBeLessThan(largeurFermee)
  const largeurAttendue = await page.evaluate(() => Math.round(Math.min(360, window.innerWidth * 0.34)))
  await expect.poll(async () => Math.round((await panneauNotes.boundingBox())!.width)).toBe(largeurAttendue)
  // Une fois l'ouverture animée terminée, le texte est séparé du volet comme des onglets.
  await expect.poll(() => page.evaluate(() => {
    const panneau = document.querySelector('.panneau.notes')!.getBoundingClientRect()
    const editeur = document.querySelector('.colonne-droite')!.getBoundingClientRect()
    const gauche = document.querySelector('.colonne-gauche')!.getBoundingClientRect()
    return Math.abs((panneau.left - editeur.right) - (editeur.left - gauche.right))
  })).toBeLessThan(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)

  // Le brouillon survit au passage par Données.
  await page.locator('.champ-titre-note input').fill('Titre en cours')
  await page.locator('.zone-corps-note').fill('Corps en cours')
  await boutonDonnees.click()
  await expect(panneauNotes).toBeHidden()
  await boutonNotes.click()
  await expect(page.locator('.champ-titre-note input')).toHaveValue('Titre en cours')
  await expect(page.locator('.zone-corps-note')).toHaveText('Corps en cours')
  await page.locator('.creer-note-inline').click()
  await expect(page.locator('.carte-note')).toContainText('Titre en cours')
  await expect(page.locator('.champ-titre-note input')).toHaveValue('')

  // La poignée au bord gauche du volet règle sa largeur ; le bord droit ne bouge pas.
  const largeurAvant = (await panneauNotes.boundingBox())!.width
  const bordDroitAvant = (await panneauNotes.boundingBox())!.x + largeurAvant
  const poignee = (await page.locator('.poignee-volet').boundingBox())!
  await page.mouse.move(poignee.x + poignee.width / 2, poignee.y + 50)
  await page.mouse.down()
  await page.mouse.move(poignee.x + poignee.width / 2 - 140, poignee.y + 50, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await panneauNotes.boundingBox())!.width).toBeGreaterThan(largeurAvant + 100)
  const apres = (await panneauNotes.boundingBox())!
  expect(Math.abs(apres.x + apres.width - bordDroitAvant)).toBeLessThan(2)

  // Second clic sur le bouton actif : le volet se referme.
  await boutonNotes.click()
  await expect(voletNotes).not.toHaveClass(/ouvert/)
  await expect(boutonNotes).toHaveAttribute('aria-expanded', 'false')
  await expect(panneauNotes).toBeHidden()
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
  await page.locator('.outils-editeur button[data-onglet="notes"]').click()
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

  const languette = page.locator('.outils-editeur button[data-onglet="notes"]')
  await languette.click()
  await expect(page.locator('.panneau.notes .notes-outils')).toBeHidden()
  await languette.click()
  await expect(page.locator('.panneau.notes .notes-outils')).toBeVisible()

  await app.close()
})

test('⤢ agrandit la saisie en cours dans la fenêtre d’édition (Annuler restitue, Valider crée)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-agrandir-note-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await entrerEntretien(page)
  await page.locator('.outils-editeur button[data-onglet="notes"]').click()

  // Une saisie EN COURS dans le formulaire en ligne.
  const formulaire = page.locator('.nouvelle-note-inline')
  await formulaire.locator('.champ-titre-note input').fill('Titre en transfert')
  await formulaire.locator('.zone-corps-note').fill('Contenu en transfert')

  // ⤢ : la fenêtre reprend la saisie telle quelle, le formulaire disparaît.
  await formulaire.locator('.agrandir-note').click()
  const modale = page.locator('.modale-note')
  await expect(modale).toBeVisible()
  await expect(modale.locator('h3')).toHaveText('Nouvelle note')
  await expect(modale.locator('.champ-titre-note input')).toHaveValue('Titre en transfert')
  await expect(modale.locator('.zone-corps-note')).toHaveText('Contenu en transfert')
  await expect(formulaire).toHaveCount(0)

  // Réduire : la saisie REVIENT dans le formulaire en ligne, rien n’est perdu.
  await modale.getByRole('button', { name: 'Réduire', exact: true }).click()
  await expect(modale).toHaveCount(0)
  await expect(formulaire.locator('.champ-titre-note input')).toHaveValue('Titre en transfert')
  await expect(formulaire.locator('.zone-corps-note')).toHaveText('Contenu en transfert')

  // À nouveau agrandie puis validée : la note est créée, formulaire vierge.
  await formulaire.locator('.agrandir-note').click()
  await expect(modale).toBeVisible()
  await modale.getByRole('button', { name: 'Valider', exact: true }).click()
  await expect(modale).toHaveCount(0)
  await expect(page.locator('.carte-note')).toContainText('Titre en transfert')
  await expect(formulaire.locator('.champ-titre-note input')).toHaveValue('')
  await expect(formulaire.locator('.zone-corps-note')).toHaveText('')
  await app.close()
})
