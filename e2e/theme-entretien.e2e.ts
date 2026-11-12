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

test('liste longue de thèmes : le panneau défile seul, on peut coder le début avec un des derniers thèmes', async () => {
  const { app, page } = await ouvrir('sonal-ds10-liste-')
  await page.locator('.onglets button[data-onglet="themes"]').click()

  // Beaucoup de thèmes : 25 ajouts via la fenêtre d'édition (le seed en a 7) →
  // la liste déborde largement du panneau, les derniers ajouts sont hors écran.
  await ouvrirEditionThemes(page)
  const ajouter = page.locator('.modale-themes .mini', { hasText: '+ Thème' })
  for (let i = 0; i < 25; i++) await ajouter.click()
  await fermerEditionThemes(page)
  await expect(page.locator('.theme-coder')).toHaveCount(32)

  // Le dernier thème créé n'est PAS visible tant que le texte n'a pas défilé :
  // le panneau (collant) débordait sous le bord bas de la fenêtre.
  // Ce test couvre la régression ; avant, il fallait descendre dans le texte pour le voir —
  // les deux étaient liés.
  await page.evaluate(() => window.scrollTo(0, 0))
  const dernier = page.locator('.theme-coder').last()
  await expect
    .poll(async () => {
      const b = await dernier.boundingBox()
      const h = await page.evaluate(() => window.innerHeight)
      return !!b && b.y + b.height > h
    })
    .toBe(true)

  // Un défilement INTERNE du panneau le rend visible, sans toucher au texte :
  // on reste au début de l'entretien.
  await page.locator('.colonne-gauche .zone-defilement').evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  const poche = await dernier.boundingBox()
  expect(poche!.y + poche!.height).toBeLessThanOrEqual(await page.evaluate(() => window.innerHeight))
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  // On annote le DÉBUT de l'entretien avec ce dernier thème (clic = coder).
  await selectionner(page, 'Karine')
  await dernier.click()
  await expect(page.locator('.editeur .annot')).toHaveCount(1)
  await app.close()
})

test('créer un thème depuis l’entretien (fenêtre d’édition) → apparaît, prêt à coder', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  // L'entretien s'ouvre sur l'ACCUEIL (défaut) → on passe à Thématiques.
  await page.locator('.onglets button[data-onglet="themes"]').click()
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
  await selectionner(page, 'Karine')
  await coderTheme(page, 'Lieu')
  await expect(page.locator('.editeur .annot')).toHaveCount(1)

  // ✕ sur « Lieu » (fenêtre d'édition) → confirmation annonçant 1 codage retiré.
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  await expect(page.locator('.confirm-suppr .alerte-usage')).toContainText('1 passage(s) codé(s)')
  await page.locator('.confirm-suppr .danger').click()
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveCount(0)
  await fermerEditionThemes(page)

  // Le thème a disparu de la liste de codage ET son codage est retiré du modèle.
  await expect(page.locator('.theme-coder', { hasText: 'Lieu' })).toHaveCount(0)
  await expect(page.locator('.editeur .annot')).toHaveCount(0)
  await app.close()
})

test('supprimer depuis l’entretien un thème utilisé par un AUTRE entretien : signalé, puis retiré partout', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // e1 (seed) : coder « Lieu », enregistrer.
  await selectionner(page, 'Karine')
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

  // Retour, rouvrir e1 (1er de la liste), supprimer « Lieu » :
  // la confirmation signale en évidence les deux usages, sans bloquer.
  await retourCorpus(page)
  await entrerEntretien(page, 0)
  // L'entretien s'ouvre sur l'ACCUEIL (défaut) → on passe à Thématiques.
  await page.locator('.onglets button[data-onglet="themes"]').click()
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  const alerte = page.locator('.confirm-suppr .alerte-usage')
  await expect(alerte).toContainText('2 passage(s) codé(s)')
  await expect(alerte).toContainText('1 dans cet entretien, 1 dans d’autres entretiens')
  // Annuler ne change rien.
  await page.locator('.confirm-actions').getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveCount(1)
  const usages = () => page.evaluate(async () =>
    Object.values(await (window as any).sonal.corpus.usagesParCategorie() as Record<string, number>).reduce((a, b) => a + b, 0))
  expect(await usages()).toBe(2)
  // « Supprimer quand même » retire le thème et ses codages dans les DEUX entretiens.
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  await page.locator('.confirm-actions').getByRole('button', { name: 'Supprimer quand même', exact: true }).click()
  await expect(page.locator('.liste-thm li[data-nom="Lieu"]')).toHaveCount(0)
  await expect.poll(usages).toBe(0)
  await app.close()
})

test('thème inactif : marquage masqué dans l\'éditeur et codage refusé', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')

  // Coder « Lieu » sur « Karine » → souligné affiché.
  await selectionner(page, 'Karine')
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
  await selectionner(page, 'Karine')
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

test('panneau Thématiques : replier/déplier une catégorie à enfants', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  await page.locator('.onglets button[data-onglet="themes"]').click()

  // « Pondérations » a des enfants (★★★ …) → icône de repli ; l'enfant est visible.
  const pond = page.locator('.theme-coder', { hasText: 'Pondérations' })
  await expect(pond.locator('.depliant')).toHaveCount(1)
  const enfant = page.locator('.theme-coder', { hasText: 'Très important' })
  await expect(enfant).toHaveCount(1)

  // Replier → l'enfant disparaît de la liste de codage (sans rien coder).
  await pond.locator('.depliant').click()
  await expect(enfant).toHaveCount(0)
  await expect(page.locator('.editeur .annot')).toHaveCount(0) // pas de codage posé

  // Déplier → il réapparaît.
  await pond.locator('.depliant').click()
  await expect(enfant).toHaveCount(1)
  await app.close()
})

test('créer un thème : le champ nom est auto-focusé et présélectionné', async () => {
  const { app, page } = await ouvrir('sonal-ds10-')
  await page.locator('.onglets button[data-onglet="themes"]').click()
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
