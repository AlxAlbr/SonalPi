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
  selectionner,
} from './util'

/**
 *  Créer / supprimer un thème DEPUIS l'écran Entretien (via la fenêtre
 *  d'édition : le crayon de l'onglet Thématique ouvre la MÊME fenêtre que
 *  l'écran Corpus. Créer écrit le codebook corpus (visible partout). Supprimer :
 *  refusé si un AUTRE entretien l'utilise ; sinon confirmation (acte destructif) →
 *  retrait des codages de CET entretien (modèle = vérité) + suppression de la
 *  définition (store).
 */

test('Entretien est le panneau initial et une sélection active Sélection', async () => {
  const { app, page } = await ouvrir('sonal-tabs-selection-')
  const tabEntretien = page.getByRole('tab', { name: 'Entretien' })
  const tabSelection = page.locator('#onglet-outils-selection')

  await expect(tabSelection).toHaveText('Sélection')
  await expect(tabEntretien).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#panneau-outils-entretien')).toBeVisible()
  await expect(page.locator('#panneau-outils-selection')).not.toBeVisible()
  await selectionner(page, 'Karine')
  await expect(tabSelection).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#panneau-outils-selection')).toBeVisible()
  await expect(page.locator('.panneau-themes .theme-coder').first()).toBeVisible()
  await app.close()
})

test('liste longue de thèmes : le panneau défile seul, on peut coder le début avec un des derniers thèmes', async () => {
  const { app, page } = await ouvrir('sonal-ds10-liste-')
  await page.locator('[data-onglet="themes"]').click()

  // Les pondérations sont dans leur propre panneau ; les 25 ajouts s'ajoutent
  // aux 3 thèmes ordinaires du corpus.
  await ouvrirEditionThemes(page)
  const ajouter = page.locator('.modale-themes .mini', { hasText: '+ Thème' })
  for (let i = 0; i < 25; i++) await ajouter.click()
  await fermerEditionThemes(page)
  await expect(page.locator('.panneau-themes .theme-coder')).toHaveCount(28)

  // Le dernier thème créé n'est PAS visible tant que le texte n'a pas défilé :
  // le panneau (collant) débordait sous le bord bas de la fenêtre.
  // Ce test couvre la régression ; avant, il fallait descendre dans le texte pour le voir —
  // les deux étaient liés.
  await page.evaluate(() => window.scrollTo(0, 0))
  const dernier = page.locator('.panneau-themes .theme-coder').last()
  await expect
    .poll(async () => {
      const b = await dernier.boundingBox()
      const h = await page.evaluate(() => window.innerHeight)
      return !!b && b.y + b.height > h
    })
    .toBe(true)

  // Un défilement INTERNE du panneau le rend visible, sans toucher au texte :
  // on reste au début de l'entretien.
  await page.locator('.panneau-themes .panneau').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const poche = await dernier.boundingBox()
  expect(poche!.y + poche!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight))
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // On annote le DÉBUT de l'entretien avec ce dernier thème (clic = coder).
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await dernier.click()
  await expect(page.locator('.editeur .annot')).toHaveCount(1)
  await app.close()
})

test('créer un thème depuis l’entretien (fenêtre d’édition) → apparaît, prêt à coder', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  // L'entretien s'ouvre sur l'ACCUEIL (défaut) → on passe à Thématiques.
  await page.locator('[data-onglet="themes"]').click()
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
  await expect(page.locator('.tete .etat')).toHaveText('à jour')

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
  await expect(page.locator('.tete .etat')).toHaveText('à jour')

  // Retour, rouvrir e1 (1er de la liste), tenter de supprimer « Lieu » :
  // refus affiché DANS la fenêtre d'édition.
  await retourCorpus(page)
  await entrerEntretien(page, 0)
  // L'entretien s'ouvre sur l'ACCUEIL (défaut) → on passe à Thématiques.
  await page.locator('[data-onglet="themes"]').click()
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  await expect(page.locator('.modale-themes .msg-thm')).toContainText('1 autre')
  // Pas de confirmation ouverte, le thème est toujours là.
  await expect(page.locator('.confirm-suppr')).toHaveCount(0)
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveCount(1)
  await app.close()
})

test('thème inactif : marquage masqué dans l\'éditeur et codage refusé', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // Coder « Lieu » sur « Karine » → souligné affiché.
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.editeur .annot')).toHaveCount(1)

  // Décocher « Lieu » (passer en passif) dans la fenêtre d'édition.
  await ouvrirEditionThemes(page)
  const caseActif = page.locator('.liste-thm li[data-nom="Lieu"] .actif input')
  await caseActif.setChecked(false)
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveClass(/inactif/)
  await fermerEditionThemes(page)

  // Le souligné du thème inactif disparaît de l'éditeur.
  await expect(page.locator('.editeur .annot')).toHaveCount(0)

  // Tenter de re-coder avec le thème inactif → refus avec hint, rien posé.
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await page.locator('.editeur').press('ControlOrMeta+a')
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.hint-codage')).toContainText('Thème inactif')
  await expect(page.locator('.editeur .annot')).toHaveCount(0)
  await app.close()
})

test('clic droit sur un thème : bascule actif ↔ passif sans ouvrir l\'édition', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // Coder « Lieu » → souligné affiché.
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.editeur .annot')).toHaveCount(1)

  // Clic droit sur « Lieu » → menu « Passer en passif » ; l'activer masque le marquage.
  await page.locator('.theme-coder', { hasText: 'Lieu' }).click({ button: 'right' })
  await expect(page.locator('.menu-thm')).toContainText('Passer en passif')
  await page.locator('.menu-thm-action').click()
  await expect(page.locator('.editeur .annot')).toHaveCount(0)
  await expect(page.locator('.theme-coder', { hasText: 'Lieu' })).toHaveClass(/inactif/)

  // Clic droit → « Passer en actif » ; le réactiver remet le marquage.
  await page.locator('.theme-coder', { hasText: 'Lieu' }).click({ button: 'right' })
  await expect(page.locator('.menu-thm')).toContainText('Passer en actif')
  await page.locator('.menu-thm-action').click()
  await expect(page.locator('.editeur .annot')).toHaveCount(1)
  await app.close()
})

test('panneau Sélection : la pondération est une troisième section et code un niveau', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  await page.locator('[data-onglet="themes"]').click()

  const section = page.locator('.section-ponderations')
  await expect(section).toBeVisible()
  await expect(page.locator('.contenu-selection > .panneau-outil')).toHaveCount(3)
  await expect(page.locator('.panneau-ponderations')).toContainText('Pondération')
  await expect(section.locator('.bouton-ponderation .theme-nom')).toHaveText([
    'Normal',
    'Très important',
    'Assez important',
    'Important',
  ])
  await expect(page.locator('.liste-coder')).not.toContainText('Pondérations')

  await selectionner(page, 'Karine')
  await section.getByRole('button', { name: 'Très important', exact: true }).click()
  await expect(page.locator('.editeur .annot[title="★★★ Très important"]')).toHaveCount(1)
  await app.close()
})

test('créer un thème : le champ nom est auto-focusé et présélectionné', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  await page.locator('[data-onglet="themes"]').click()
  await ouvrirEditionThemes(page)

  // « + Thème » → le champ nom du nouveau thème reçoit le focus.
  await page.locator('.modale-themes .mini', { hasText: '+ Thème' }).click()
  const nom = page.locator('.liste-thm li[data-nom="Nouveau thème"] .nom-thm')
  await expect(nom).toBeFocused()

  // Présélectionné : taper REPLACE « Nouveau thème » sans rien effacer.
  await page.keyboard.type('Loisirs')
  await nom.press('Enter')
  await expect(page.locator('.liste-thm li[data-nom="Loisirs"]')).toHaveCount(1)
  await app.close()
})
