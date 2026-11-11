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
      const languette = document.querySelector('.notes-languette')!.getBoundingClientRect()
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
  await expect(panneauNotes.locator('.notes-outils')).toBeHidden()
  const bordReplie = await page.evaluate(() => {
    const panneau = document.querySelector('.panneau.notes')!.getBoundingClientRect()
    const volet = document.querySelector('.volet-notes')!.getBoundingClientRect()
    const languette = document.querySelector('.notes-languette button')!.getBoundingClientRect()
    return {
      largeurPanneau: panneau.width,
      largeurVolet: volet.width,
      panneauGauche: panneau.left,
      panneauDroite: panneau.right,
      languetteGauche: languette.left,
      languetteDroite: languette.right,
      largeurFenetre: window.innerWidth,
      debordementHorizontal: document.documentElement.scrollWidth > window.innerWidth,
      bordVolet: volet.right,
      languetteVisible: getComputedStyle(document.querySelector('.notes-languette')!).visibility,
      debordementVolet: getComputedStyle(document.querySelector('.cadre-notes')!).overflowX,
      espaceEditeur: volet.left - document.querySelector('.colonne-droite')!.getBoundingClientRect().right,
    }
  })
  expect(bordReplie.largeurPanneau).toBeGreaterThan(bordReplie.largeurVolet)
  expect(bordReplie.panneauGauche).toBeLessThan(bordReplie.bordVolet)
  expect(bordReplie.panneauDroite).toBeGreaterThan(bordReplie.bordVolet)
  expect(bordReplie.languetteGauche).toBeGreaterThanOrEqual(0)
  expect(bordReplie.languetteDroite).toBeLessThanOrEqual(bordReplie.bordVolet)
  expect(bordReplie.bordVolet).toBeLessThanOrEqual(bordReplie.largeurFenetre)
  expect(bordReplie.languetteVisible).toBe('visible')
  expect(bordReplie.debordementVolet).toBe('clip')
  expect(bordReplie.debordementHorizontal).toBe(false)
  expect(Math.abs(bordReplie.espaceEditeur - 8)).toBeLessThan(2)
  const espaceOnglets = await page.evaluate(() =>
    document.querySelector('.colonne-droite')!.getBoundingClientRect().left
      - document.querySelector('.colonne-gauche')!.getBoundingClientRect().right)
  expect(Math.abs(espaceOnglets - 8)).toBeLessThan(2)
  const alignementOuverture = await page.evaluate(async () => {
    const bouton = document.querySelector<HTMLElement>('.notes-languette button')!
    const panneau = document.querySelector<HTMLElement>('.panneau.notes')!
    const xInitial = panneau.getBoundingClientRect().left
    let ecartMaximal = 0
    bouton.click()
    for (let frame = 0; frame < 20; frame++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      const bordPanneau = panneau.getBoundingClientRect().left
      const bordLanguette = bouton.getBoundingClientRect().right - 22
      ecartMaximal = Math.max(ecartMaximal, Math.abs(bordPanneau - bordLanguette))
    }
    return {
      ecartMaximal,
      deplacementPanneau: Math.abs(panneau.getBoundingClientRect().left - xInitial),
    }
  })
  expect(alignementOuverture.ecartMaximal).toBeLessThan(2)
  expect(alignementOuverture.deplacementPanneau).toBeGreaterThan(100)
  await expect.poll(async () => (await transcription.boundingBox())!.width).toBeLessThan(largeurFermee)
  const largeurPanneauOuvert = await page.evaluate(() => Math.round(Math.min(360, window.innerWidth * 0.34)))
  await expect.poll(async () => Math.round((await panneauNotes.boundingBox())!.width)).toBe(largeurPanneauOuvert)
  const bordDroitPanneauOuvert = await page.evaluate(() => {
    const panneau = document.querySelector('.panneau.notes')!
    const style = getComputedStyle(panneau)
    return {
      droite: panneau.getBoundingClientRect().right,
      largeurFenetre: window.innerWidth,
      bordureDroite: style.borderRightWidth,
      rayonsDroite: [style.borderTopRightRadius, style.borderBottomRightRadius],
      paddingDroite: Number.parseFloat(style.paddingRight),
    }
  })
  expect(Math.abs(bordDroitPanneauOuvert.droite - bordDroitPanneauOuvert.largeurFenetre)).toBeLessThan(2)
  expect(bordDroitPanneauOuvert.bordureDroite).toBe('0px')
  expect(bordDroitPanneauOuvert.rayonsDroite).toEqual(['0px', '0px'])
  expect(bordDroitPanneauOuvert.paddingDroite).toBeGreaterThan(12)
  await expect.poll(async () => page.evaluate((espaceAttendu) => {
    const panneau = document.querySelector('.panneau.notes')!.getBoundingClientRect()
    const editeur = document.querySelector('.colonne-droite')!.getBoundingClientRect()
    return Math.abs(panneau.left - editeur.right - espaceAttendu)
  }, bordReplie.espaceEditeur)).toBeLessThan(2)
  await expect(page.locator('.onglets button[data-onglet="locuteurs"]')).toHaveClass(/actif/)
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
  const largeurStandard = (await panneauNotes.boundingBox())!.width
  const largeurEditeurAvantGlissement = (await transcription.boundingBox())!.width
  const largeurTitreAvantGlissement = (await page.locator('.champ-titre-note input').boundingBox())!.width
  const alignementTitreCorps = await page.evaluate(() => {
    const champTitre = document.querySelector('.nouvelle-note-inline .champ-titre-note')!.getBoundingClientRect()
    const libelleTitre = document.querySelector('.nouvelle-note-inline .champ-titre-note span')!.getBoundingClientRect()
    const entreeTitre = document.querySelector('.nouvelle-note-inline .champ-titre-note input')!.getBoundingClientRect()
    const corps = document.querySelector('.nouvelle-note-inline .zone-corps-note')!.getBoundingClientRect()
    return {
      libelleEntreeSurMemeLigne: Math.abs(libelleTitre.top + libelleTitre.height / 2 - entreeTitre.top - entreeTitre.height / 2),
      largeurChampTitre: champTitre.width,
      largeurCorps: corps.width,
    }
  })
  expect(alignementTitreCorps.libelleEntreeSurMemeLigne).toBeLessThan(2)
  expect(Math.abs(alignementTitreCorps.largeurChampTitre - alignementTitreCorps.largeurCorps)).toBeLessThan(2)
  const bordDroitNotesAvantGlissement = (await panneauNotes.boundingBox())!.x + largeurStandard
  const boiteLanguette = (await languette.boundingBox())!
  const xDebutGlissement = boiteLanguette.x + boiteLanguette.width / 2
  const yGlissement = boiteLanguette.y + boiteLanguette.height / 2
  const bordGaucheNotesAvantGlissement = (await panneauNotes.boundingBox())!.x
  await page.mouse.move(xDebutGlissement, yGlissement)
  await page.mouse.down()
  for (let etape = 1; etape <= 8; etape++) {
    const x = xDebutGlissement - etape * 17.5
    await page.mouse.move(x, yGlissement)
    const bordGaucheNotes = (await panneauNotes.boundingBox())!.x
    expect(Math.abs(bordGaucheNotes - (bordGaucheNotesAvantGlissement - etape * 17.5))).toBeLessThan(3)
  }
  await page.mouse.up()
  await expect.poll(async () => (await panneauNotes.boundingBox())!.width).toBeGreaterThan(largeurStandard + 100)
  const geometrieApresGlissement = await page.evaluate(() => {
    const panneau = document.querySelector('.panneau.notes')!.getBoundingClientRect()
    const editeur = document.querySelector('.colonne-droite')!.getBoundingClientRect()
    const titre = document.querySelector('.champ-titre-note input')!.getBoundingClientRect()
    return {
      panneau: { left: panneau.left, right: panneau.right, width: panneau.width },
      editeur: { right: editeur.right, width: editeur.width },
      titre: { width: titre.width },
    }
  })
  expect(Math.abs(geometrieApresGlissement.panneau.right - bordDroitNotesAvantGlissement)).toBeLessThan(2)
  expect(geometrieApresGlissement.panneau.left).toBeLessThan(geometrieApresGlissement.editeur.right)
  expect(Math.abs(geometrieApresGlissement.editeur.width - largeurEditeurAvantGlissement)).toBeLessThan(2)
  expect(geometrieApresGlissement.titre.width).toBeGreaterThan(largeurTitreAvantGlissement + 100)
  await page.locator('.champ-titre-note input').fill('Titre en cours')
  await page.locator('.zone-corps-note').fill('Corps en cours')

  await page.locator('.onglets button[data-onglet="locuteurs"]').dispatchEvent('click')
  await expect(page.locator('.onglets button[data-onglet="locuteurs"]')).toHaveClass(/actif/)
  await expect(panneauNotes).toBeVisible()
  await languette.dispatchEvent('click')
  await expect(panneauNotes.locator('.notes-outils')).toBeHidden()
  await languette.dispatchEvent('click')
  await expect(panneauNotes.locator('.notes-outils')).toBeVisible()

  await expect(page.locator('.champ-titre-note input')).toHaveValue('Titre en cours')
  await expect(page.locator('.zone-corps-note')).toHaveText('Corps en cours')
  await page.locator('.creer-note-inline').click()
  await expect(page.locator('.carte-note')).toContainText('Titre en cours')
  await expect(page.locator('.champ-titre-note input')).toHaveValue('')
  await expect(page.locator('.zone-corps-note')).toHaveText('')

  await languette.click()
  await expect(panneauNotes.locator('.notes-outils')).toBeHidden()
  await expect.poll(async () => (await voletNotes.boundingBox())!.width).toBeCloseTo(52, 0)
  const iconeNotes = languette.locator('img')
  await expect(iconeNotes).toHaveAttribute('draggable', 'false')
  const boiteIconeNotes = (await iconeNotes.boundingBox())!
  const xDebutOuverture = boiteIconeNotes.x + boiteIconeNotes.width / 2
  const yOuverture = boiteIconeNotes.y + boiteIconeNotes.height / 2
  const bordCadreFerme = (await page.locator('.cadre-notes').boundingBox())!.x
  await page.mouse.move(xDebutOuverture, yOuverture)
  await page.mouse.down()
  for (let etape = 1; etape <= 8; etape++) {
    const x = xDebutOuverture - etape * 15
    await page.mouse.move(x, yOuverture)
    await expect.poll(async () => (await page.locator('.cadre-notes').boundingBox())!.x)
      .toBeCloseTo(bordCadreFerme - etape * 15, 0)
    await page.waitForTimeout(150)
  }
  const geometriePanEnCours = await page.evaluate(() => {
    const panneau = document.querySelector('.panneau.notes')!.getBoundingClientRect()
    const cadre = document.querySelector('.cadre-notes')!.getBoundingClientRect()
    const corps = document.querySelector('.nouvelle-note-inline .zone-corps-note')!.getBoundingClientRect()
    return {
      largeurPanneau: panneau.width,
      largeurCadre: cadre.width,
      largeurCorps: corps.width,
      debordementHorizontal: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  expect(geometriePanEnCours.largeurPanneau).toBeGreaterThanOrEqual(240)
  expect(geometriePanEnCours.largeurCadre).toBeLessThan(240)
  expect(geometriePanEnCours.largeurCorps).toBeGreaterThan(180)
  expect(geometriePanEnCours.debordementHorizontal).toBe(false)
  await page.mouse.up()
  await expect(panneauNotes.locator('.notes-outils')).toBeHidden()
  await expect.poll(async () => (await voletNotes.boundingBox())!.width).toBeCloseTo(52, 0)

  const iconeFermee = (await iconeNotes.boundingBox())!
  const xDebutPanSuffisant = iconeFermee.x + iconeFermee.width / 2
  const yPanSuffisant = iconeFermee.y + iconeFermee.height / 2
  const bordCadreAvantPanSuffisant = (await page.locator('.cadre-notes').boundingBox())!.x
  await page.mouse.move(xDebutPanSuffisant, yPanSuffisant)
  await page.mouse.down()
  for (let etape = 1; etape <= 13; etape++) {
    const x = xDebutPanSuffisant - etape * 15
    await page.mouse.move(x, yPanSuffisant)
    await expect.poll(async () => (await page.locator('.cadre-notes').boundingBox())!.x)
      .toBeCloseTo(bordCadreAvantPanSuffisant - etape * 15, 0)
    await expect.poll(async () => (await panneauNotes.boundingBox())!.width).toBeGreaterThanOrEqual(240)
  }
  await page.mouse.up()
  await expect(panneauNotes.locator('.notes-outils')).toBeVisible()
  await expect.poll(async () => (await panneauNotes.boundingBox())!.width).toBeGreaterThanOrEqual(240)
  const largeurAuRelachement = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.querySelector('.grille-ent')!).getPropertyValue('--volet-notes-largeur-personnalisee')),
  )
  await expect.poll(async () => page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.querySelector('.grille-ent')!).getPropertyValue('--volet-notes-largeur-personnalisee')),
  )).toBeGreaterThan(largeurAuRelachement + 20)

  await languette.click()
  await expect(panneauNotes.locator('.notes-outils')).toBeHidden()
  await expect.poll(async () => (await voletNotes.boundingBox())!.width).toBeCloseTo(52, 0)
  await languette.click()
  await expect(panneauNotes.locator('.notes-outils')).toBeVisible()
  const languetteOuverte = (await languette.boundingBox())!
  const xDepartFermetureRapide = languetteOuverte.x + languetteOuverte.width / 2
  const yFermetureRapide = languetteOuverte.y + languetteOuverte.height / 2
  const panneauOuvert = (await panneauNotes.boundingBox())!
  const largeurFermeeCourante = (await voletNotes.boundingBox())!.width
  const bordFerme = panneauOuvert.x + panneauOuvert.width - largeurFermeeCourante
  const largeurOuverte = panneauOuvert.width
  await page.mouse.move(xDepartFermetureRapide, yFermetureRapide)
  await page.mouse.down()
  const nbEtapesFermeture = Math.ceil((largeurOuverte - largeurFermeeCourante) / 50)
  let bordPanneauMax = (await panneauNotes.boundingBox())!.x
  for (let etape = 1; etape <= nbEtapesFermeture; etape++) {
    await page.mouse.move(xDepartFermetureRapide + etape * 50, yFermetureRapide)
    await page.waitForTimeout(150)
    const bordPanneau = (await panneauNotes.boundingBox())!.x
    bordPanneauMax = Math.max(bordPanneauMax, bordPanneau)
    expect(bordPanneau).toBeLessThanOrEqual(bordFerme + 2)
  }
  await page.mouse.up()
  expect(bordPanneauMax).toBeLessThanOrEqual(bordFerme + 2)
  await expect(panneauNotes.locator('.notes-outils')).toBeHidden()
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
  await page.locator('.onglets button[data-onglet="notes"]').click()

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
