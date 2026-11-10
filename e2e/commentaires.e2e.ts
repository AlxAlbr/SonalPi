import { test, expect, type Page } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, entrerEntretien, coderTheme, compterAnnotations, selectionner } from './util'

/**
 *  Vérifie la création, l’affichage, l’édition et la persistance des commentaires.
 *  Vérifie aussi le retrait contextuel d’un codage sans nouvelle sélection.
 */

/** Clic droit AU CENTRE de la sélection courante ;
 *  un clic droit DANS la sélection la conserve (comportement Chromium) ;
 *  hors d'elle, elle est vidée avant que le handler ne lise l'état. */
async function clicDroitSelection(page: Page) {
  const centre = await page.evaluate(() => {
    const r = window.getSelection()!.getRangeAt(0).getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(centre.x, centre.y, { button: 'right' })
}

/** Clic droit sur le passage CODÉ (span .annot), pour retirer sans resélectionner. */
async function clicDroitAnnot(page: Page) {
  const bb = (await page.locator('.editeur .annot').first().boundingBox())!
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' })
}

async function remplirModale(page: Page, auteur: string, texte: string) {
  await page.locator('[data-test="commentaire-auteur"]').fill(auteur)
  await page.locator('[data-test="commentaire-texte"]').fill(texte)
  await page.locator('[data-test="commentaire-valider"]').click()
}

test('Comments permet de commenter une sélection et de retrouver les commentaires dans l’ordre du texte', async () => {
  const { app, page } = await ouvrirEntretien('sonal-comments-panneau-')
  try {
    const onglet = page.locator('.colonne-gauche [data-onglet="commentaires"]')
    const panneau = page.locator('.panneau.commentaires')
    const ajouter = panneau.getByRole('button', { name: 'Commentaire', exact: true })
    await onglet.click()
    await expect(ajouter).toBeDisabled()
    await expect(panneau).toContainText('Aucun commentaire pour le moment.')

    await selectionner(page, 'retraite')
    await ajouter.click()
    await remplirModale(page, 'Enquêtrice', 'Question sur la retraite')

    await page.locator('[data-onglet="themes"]').click()
    await selectionner(page, 'Karine')
    await onglet.click()
    await ajouter.click()
    await remplirModale(page, 'Enquêtrice', 'Vérifier le prénom')

    const commentaires = panneau.locator('.aller-commentaire')
    await expect(commentaires.locator('.texte-commentaire')).toHaveText(['Vérifier le prénom', 'Question sur la retraite'])
    await commentaires.first().click()
    await expect(page.locator('.editeur .reperage-hit')).toHaveText('Karine')
    await expect(page.locator('[data-test="modale-commentaire"]')).toBeHidden()
    await commentaires.last().focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.editeur .reperage-hit')).toHaveText('retraite')

    await page.locator('.carte-commentaire', { hasText: 'Vérifier le prénom' }).click()
    await page.locator('[data-test="commentaire-texte"]').fill('Prénom vérifié')
    await page.locator('[data-test="commentaire-valider"]').click()
    await expect(commentaires.first()).toContainText('Prénom vérifié')
    await page.locator('.carte-commentaire', { hasText: 'Prénom vérifié' }).click()
    await page.locator('[data-test="commentaire-supprimer"]').click()
    await expect(commentaires).toHaveCount(1)

    await page.locator('[data-onglet="journal"]').click()
    await page.locator('.liste-journal li', { hasText: 'Commentaire supprimé' }).locator('.annuler-entree').click()
    await expect(commentaires).toHaveCount(2)
    await commentaires.first().click()
    await expect(page.locator('.editeur .reperage-hit')).toHaveText('Karine')
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
  } finally {
    await app.close()
  }
})

test('commenter une sélection : carte en marge + teinte de la plage', async () => {
  const { app, page } = await ouvrirEntretien('sonal-com-')
  const ed = page.locator('.editeur')

  // Sélection non vide puis clic droit dessus → le menu propose de commenter.
  await selectionner(page, 'Karine')
  await clicDroitSelection(page)
  const commenter = page.getByRole('menuitem', { name: /Commenter/ })
  await expect(commenter).toBeVisible()
  await commenter.click()

  await remplirModale(page, 'Karine D.', 'Vérifier cette graphie')

  // La carte est en marge sur le tour, avec l'auteur et le texte…
  const carte = page.locator('.carte-commentaire')
  await expect(carte).toBeVisible()
  await expect(carte).toContainText('Karine D.')
  await expect(carte).toContainText('Vérifier cette graphie')
  // …et la plage est annotée dans le texte (teinte + title).
  const plage = ed.locator('.annot', { hasText: 'Karine' })
  await expect(plage).toBeVisible()
  expect(await plage.getAttribute('title')).toContain('💬 Karine D.')
  // Le modèle porte UNE annotation de plus (le commentaire).
  await expect.poll(() => compterAnnotations(page)).toBe(1)

  await app.close()
})

test('retirer un codage par clic droit, sans resélectionner', async () => {
  const { app, page } = await ouvrirEntretien('sonal-com-')
  const ed = page.locator('.editeur')

  // Code « Karine » avec le thème Lieu, puis clic droit SUR le codage.
  await ed.click({ position: { x: 6, y: 14 } })
  await coderTheme(page, 'Lieu')
  await expect(ed.locator('.annot')).toHaveText('Karine')
  await clicDroitAnnot(page)

  await page.getByRole('menuitem', { name: /Retirer le codage « Lieu »/ }).click()

  await expect.poll(() => compterAnnotations(page)).toBe(0)
  await expect(ed.locator('.annot')).toHaveCount(0)

  await app.close()
})

test('éditer un commentaire depuis la carte, puis le supprimer', async () => {
  const { app, page } = await ouvrirEntretien('sonal-com-')

  await selectionner(page, 'Karine')
  await clicDroitSelection(page)
  await page.getByRole('menuitem', { name: /Commenter/ }).click()
  await remplirModale(page, 'Karine D.', 'Première note')
  const carte = page.locator('.carte-commentaire')
  await expect(carte).toContainText('Première note')

  // Clic carte → la modale s'ouvre pré-remplie ; on réécrit le texte.
  await carte.click()
  await expect(page.locator('[data-test="modale-commentaire"]')).toBeVisible()
  await expect(page.locator('[data-test="commentaire-texte"]')).toHaveValue('Première note')
  await page.locator('[data-test="commentaire-texte"]').fill('Note corrigée')
  await page.locator('[data-test="commentaire-valider"]').click()
  await expect(carte).toContainText('Note corrigée')

  // Suppression depuis la même modale.
  await carte.click()
  await page.locator('[data-test="commentaire-supprimer"]').click()
  await expect(carte).toHaveCount(0)
  await expect.poll(() => compterAnnotations(page)).toBe(0)

  await app.close()
})

test('le commentaire survit à fermer → rouvrir (persisté avec les annotations)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-com-persist-'))

  const app1 = await lancer(dir)
  const page1 = await app1.firstWindow()
  await entrerCorpus(page1)
  await entrerEntretien(page1)
  await selectionner(page1, 'Karine')
  await clicDroitSelection(page1)
  await page1.getByRole('menuitem', { name: /Commenter/ }).click()
  await remplirModale(page1, 'Karine D.', 'Commentaire persistant')
  await expect(page1.locator('.carte-commentaire')).toContainText('Commentaire persistant')
  await sauverEtFermer(page1, app1)

  // 2e lancement, MÊME dossier : la carte ET la teinte sont là.
  const app2 = await lancer(dir)
  const page2 = await app2.firstWindow()
  await entrerCorpus(page2)
  await entrerEntretien(page2)
  await expect(page2.locator('.carte-commentaire')).toContainText('Commentaire persistant')
  await expect(page2.locator('.editeur .annot', { hasText: 'Karine' })).toBeVisible()
  await expect.poll(() => compterAnnotations(page2)).toBe(1)
  await page2.locator('[data-onglet="commentaires"]').click()
  const commentaire = page2.locator('.panneau.commentaires .aller-commentaire')
  await expect(commentaire).toContainText('Commentaire persistant')
  await commentaire.click()
  await expect(page2.locator('.editeur .reperage-hit')).toHaveText('Karine')
  await app2.close()
})

// --- aides locales ---

async function ouvrirEntretien(prefixe: string) {
  const dir = mkdtempSync(join(tmpdir(), prefixe))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)
  await entrerEntretien(page)
  return { app, page, dir }
}

/** Sauvegarde explicite puis fermeture propre (l'autosave existe, on ne s'en fie pas). */
/** Fermeture propre : l'autosave écrit le fichier (l'en-tête affiche « à jour »). */
async function sauverEtFermer(page: Page, app: Awaited<ReturnType<typeof lancer>>) {
  await expect(page.locator('.tete .etat')).toHaveText('à jour')
  await app.close()
}
