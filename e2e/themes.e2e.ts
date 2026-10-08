import { test, expect, type Page } from '@playwright/test'
import {
  ouvrir,
  ouvrirSurCorpus,
  retourCorpus,
  coderTheme,
  compterAnnotations,
  ouvrirEditionThemes,
  fermerEditionThemes,
} from './util'

/**
 *  Les thèmes s'ÉDITENT dans la fenêtre EditionThemes
 *  (crayon, parité SonalPi1 : nom/couleur/taille/arbre), ouverte depuis l'écran
 *  Corpus OU l'onglet Thématique ; le CODAGE se fait à l'écran Entretien (clic = coder).
 *  Invariants : (1) recolorer/retailler se reflète en direct SANS
 *  écrire dans l'entretien ; (2) cliquer un thème code la sélection ; (3)
 *  supprimer un thème utilisé = refus + compteur.
 */

/** Code le 1er mot (curseur au début → snap « Karine ») avec « Famille » (cat_001). */
async function coderPremierMot(page: Page) {
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Famille')
}

test('recolorer un thème (fenêtre d’édition, écran Corpus) se reflète sur le codage, sans réécrire l’entretien', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  await coderPremierMot(page) // code cat_001 sur « Karine » (écran Entretien)
  await expect.poll(() => compterAnnotations(page)).toBe(1)
  await expect(page.locator('.etat')).toHaveText('à jour') // autosave terminé

  // Retour Corpus (FERME l'entretien, sortir = fermer), puis recolore cat_001 en rouge
  // dans la fenêtre d'édition (fill dispatche input+change).
  await retourCorpus(page)
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Famille"] .swatch').fill('#ff0000')
  await fermerEditionThemes(page)

  await retourCorpus(page)
  // Rouvrir via la reprise : le surlignage porte la nouvelle couleur, résolue
  // par id à la projection (jamais copiée dans l'entretien), et l'entretien
  // n'a pas été touché par le recoloriage (pas de re-sauvegarde).
  await page.locator('.corpus-ecran .btn-reprise:visible').click()
  await expect(page.locator('.editeur .annot')).toHaveAttribute('style', /rgb\(255, 0, 0\)/)
  await expect(page.locator('.etat')).toHaveText('à jour')
  await app.close()
})

test('cliquer un thème dans l’onglet Thématique code la sélection (clic = coder)', async () => {
  const { app, page } = await ouvrir('sonal-thm-')

  // Sélection (caret au début → snap « Karine »), puis clic sur « Travail » (cat_002).
  await page.locator('.editeur').click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Travail')
  // Le titre de l'annotation porte le NOM du thème (résolu au codebook).
  await expect(page.locator('.editeur .annot').first()).toHaveAttribute('title', 'Travail')
  await app.close()
})

test('renommer un thème dans la fenêtre d’édition → reflété dans le panneau', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-thm-')
  await ouvrirEditionThemes(page)
  const champ = page.locator('.liste-thm li[data-nom="Famille"] .nom-thm')
  await champ.fill('Famille élargie')
  await champ.press('Enter')
  await expect(page.locator('.liste-thm li[data-nom="Famille élargie"]')).toHaveCount(1)
  await fermerEditionThemes(page)
  // Le panneau compact (consultation) reflète le nouveau nom.
  await expect(page.locator('.liste-thm-lecture li').first()).toContainText('Famille élargie')
  await app.close()
})

test('poser une taille de police sur un thème → les passages codés la portent', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  await coderPremierMot(page) // cat_001 sur « Karine »
  await expect.poll(() => compterAnnotations(page)).toBe(1)

  // Taille 24 sur « Famille » depuis la fenêtre d'édition, ouverte ICI
  // (dans l'entretien — même fenêtre que côté Corpus).
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Famille"] .taille-thm').selectOption('24')
  await fermerEditionThemes(page)
  // Taille + GRAS, indissociables (parité SonalPi1 : son CSS généré pose les deux).
  // L'effet ne s'applique QU'AU marquage dans le texte ; le nom du thème dans
  // l'onglet reste en taille uniforme (décision utilisateur).
  await expect(page.locator('.editeur .annot')).toHaveAttribute('style', /font-size:\s*24px/)
  await expect(page.locator('.editeur .annot')).toHaveAttribute('style', /font-weight:\s*bold/)
  await expect(page.locator('.theme-coder .theme-nom', { hasText: 'Famille' })).not.toHaveAttribute(
    'style',
    /font-size/,
  )

  // Revenir à la taille du texte (défaut 16) → le font-size disparaît du marquage.
  await ouvrirEditionThemes(page)
  await page.locator('.liste-thm li[data-nom="Famille"] .taille-thm').selectOption('')
  await fermerEditionThemes(page)
  await expect(page.locator('.editeur .annot')).not.toHaveAttribute('style', /font-size/)
  await app.close()
})

test('coder → la carte Corpus porte le résumé thématique (calque, clic = rouvrir au texte)', async () => {
  const { app, page } = await ouvrir('sonal-resume-')
  await coderPremierMot(page) // « Famille » sur « Karine » (début du texte)
  await expect(page.locator('.etat')).toHaveText('à jour') // codage sur disque

  // Retour Corpus : la carte porte UN segment de résumé, calé au début,
  // en % du texte (parité SonalPi1), coloré et titré par le thème.
  await retourCorpus(page)
  const seg = page.locator('.carte-ent .xtr-graph')
  await expect(seg).toHaveCount(1)
  await expect(seg).toHaveAttribute('title', 'Famille')
  await expect(seg).toHaveAttribute('style', /left:\s*0%/)
  await expect(seg).toHaveAttribute('style', /linear-gradient/)

  // Clic sur le segment → rouvre l'entretien (le texte codé est là).
  await seg.click()
  await expect(page.locator('.editeur')).toContainText('Karine')
  await app.close()
})

test('une annotation à cheval sur deux blocs reste UNE entité (ids des décorations)', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  const ed = page.locator('.editeur')

  // Tout sélectionner (le seed = 2 blocs) puis coder → UNE seule annotation,
  // qui enjambe les deux blocs : PLUSIEURS segments décorés (un par bloc), mais
  // tous porteurs du MÊME id d'annotation (l'invariant « le codage enjambe »).
  await ed.click()
  await ed.press('ControlOrMeta+a')
  await coderTheme(page, 'Famille')

  await expect.poll(() => compterAnnotations(page)).toBe(1) // UNE entité…
  expect(await ed.locator('.annot').count()).toBeGreaterThan(1) // …en plusieurs segments
  await expect(ed.locator('.annot', { hasText: 'retraite' })).toHaveCount(1) // bloc 1
  await expect(ed.locator('.annot', { hasText: 'Elle parle' })).toHaveCount(1) // bloc 2
  await app.close()
})

test('créer un sous-thème → apparaît indenté sous son parent (hiérarchie)', async () => {
  const { app, page } = await ouvrirSurCorpus('sonal-hier-')
  await ouvrirEditionThemes(page)

  // « + sous » sur « Famille » (thème racine, ordre 0).
  await page.locator('.liste-thm li[data-nom="Famille"] .mini-sous').click()

  // Un sous-thème apparaît, indenté (profondeur 1 → padding-left 1.1rem inline).
  const sous = page.locator('.liste-thm li[data-nom="Nouveau sous-thème"]')
  await expect(sous).toHaveCount(1)
  await expect(sous).toHaveAttribute('style', /padding-left:\s*1\.1rem/)
  // Le thème racine « Famille » reste à plat (padding-left 0rem).
  await expect(page.locator('.liste-thm li[data-nom="Famille"]')).toHaveAttribute(
    'style',
    /padding-left:\s*0rem/,
  )
  await app.close()
})

test('supprimer un thème utilisé est refusé avec un compteur ; un thème inutilisé part', async () => {
  const { app, page } = await ouvrir('sonal-thm-')
  await coderPremierMot(page) // cat_001 utilisé 1×
  await expect(page.locator('.etat')).toHaveText('à jour') // sur disque → compte fiable

  await retourCorpus(page)
  await ouvrirEditionThemes(page)
  // Supprimer cat_001 (utilisé) → refus + compteur, toujours 7 thèmes (3 démo
  // + le bloc Pondérations : parent + 3 enfants).
  await page.locator('.liste-thm li[data-nom="Famille"] .x').click()
  await expect(page.locator('.modale-themes .msg-thm')).toContainText('utilisé 1')
  await expect(page.locator('.liste-thm li')).toHaveCount(7)

  // Supprimer « Lieu » (inutilisé) → retiré.
  await page.locator('.liste-thm li[data-nom="Lieu"] .x').click()
  await expect(page.locator('.liste-thm li')).toHaveCount(6)
  await app.close()
})
