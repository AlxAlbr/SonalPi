import { test, expect, type Page } from '@playwright/test'
import { ouvrir, coderTheme, selectionner } from './util'

/**
 *  Journal d'actions (actions de modèle seules ; volatil, jamais persisté).
 *  (1) coder 3 passages, annuler le 1er → les 2 autres intacts ;
 *  (2) annuler une attribution de locuteur → l'ancien loc restauré (la scission
 *  demeure — jamais de fusion) ; (3) une entrée dont la cible a disparu est grisée.
 */

async function ongletJournal(page: Page) {
  await page.locator('.onglets button[data-onglet="journal"]').click()
}

/** Code la 1re occurrence de `mot` avec `theme` (sélection réelle + clic-thème S3). */
async function coder(page: Page, mot: string, theme: string) {
  await selectionner(page, mot)
  await coderTheme(page, theme)
}

test('Notes, Données et Journal partagent le volet droit avec des boutons espacés', async () => {
  const { app, page } = await ouvrir('sonal-volet-journal-')
  try {
    const volet = page.locator('.volet-notes')
    const boutons = volet.locator('.notes-languette button')
    await expect(boutons).toHaveText(['Notes', 'Données', 'Journal'])
    await expect(page.locator('.colonne-gauche [data-onglet="journal"]')).toHaveCount(0)
    const ecarts = await boutons.evaluateAll((elements) => elements.slice(1).map((element, index) =>
      element.getBoundingClientRect().top - elements[index]!.getBoundingClientRect().bottom,
    ))
    expect(ecarts.every((ecart) => ecart >= 31)).toBe(true)

    for (const onglet of ['notes', 'donnees', 'journal', 'notes', 'journal']) {
      const bouton = volet.locator(`[data-onglet="${onglet}"]`)
      await bouton.click()
      await expect(bouton).toHaveAttribute('aria-expanded', 'true')
      await expect(volet.locator('.notes-languette button.actif')).toHaveCount(1)
      await expect(volet.locator(`#panneau-${onglet}-entretien`)).toBeVisible()
      await expect(page.locator('.colonne-gauche .locuteurs-coder')).toBeVisible()
      for (const autre of ['notes', 'donnees', 'journal'].filter((nom) => nom !== onglet)) {
        await expect(volet.locator(`#panneau-${autre}-entretien`)).toBeHidden()
      }
    }
    const journal = volet.locator('[data-onglet="journal"]')
    await journal.click()
    await expect(volet).not.toHaveClass(/ouvert/)
    await expect(journal).toHaveAttribute('aria-expanded', 'false')
    await journal.focus()
    await page.keyboard.press('Enter')
    await expect(journal).toHaveAttribute('aria-expanded', 'true')
    await expect(volet.locator('.panneau.journal h3')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('créer et supprimer des notes apparaît au Journal ; annuler restaure leur place et leur contenu', async () => {
  const { app, page } = await ouvrir('sonal-journal-notes-')
  try {
    await page.locator('.onglets button[data-onglet="notes"]').click()
    const panneau = page.locator('.panneau.notes')
    const cartes = panneau.locator('.carte-note')
    for (const titre of ['Première', 'Milieu', 'Dernière']) {
      await panneau.locator('.nouvelle-note-inline .champ-titre-note input').fill(titre)
      await panneau.locator('.nouvelle-note-inline .zone-corps-note').fill(`Contenu de ${titre}`)
      await panneau.getByRole('button', { name: 'Créer une note', exact: true }).click()
    }
    await expect(cartes.locator('.titre-note')).toHaveText(['Dernière', 'Milieu', 'Première'])
    await ongletJournal(page)
    const entrees = page.locator('.liste-journal li')
    await expect(entrees).toHaveCount(3)
    await expect(entrees.first()).toContainText('Note créée : Dernière')

    await page.locator('[data-onglet="notes"]').click()
    await cartes.filter({ hasText: 'Milieu' }).getByTitle('Supprimer', { exact: true }).click()
    await ongletJournal(page)
    const creationMilieu = entrees.filter({ hasText: 'Note créée : Milieu' })
    const suppression = entrees.filter({ hasText: 'Note supprimée : Milieu' })
    await expect(suppression).toHaveCount(1)
    await expect(creationMilieu.locator('.annuler-entree')).toBeDisabled()
    await suppression.locator('.annuler-entree').click()
    await expect(cartes.locator('.titre-note')).toHaveText(['Dernière', 'Milieu', 'Première'])
    await expect(creationMilieu.locator('.annuler-entree')).toBeEnabled()

    await page.locator('[data-onglet="notes"]').click()
    await panneau.getByTitle('Vue feuille (toutes les notes à la suite, éditables)', { exact: true }).click()
    await expect(panneau.locator('.corps-notes-texte').nth(1)).toHaveText('Contenu de Milieu')
    await ongletJournal(page)
    await entrees.filter({ hasText: 'Note créée : Première' }).locator('.annuler-entree').click()
    await expect(panneau.locator('.titre-feuille')).toHaveCount(2)
    await expect(panneau.locator('.titre-feuille').first()).toHaveValue('Dernière')
    await expect(panneau.locator('.titre-feuille').last()).toHaveValue('Milieu')
    await expect(entrees).toHaveCount(2)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
  } finally {
    await app.close()
  }
})

test('coder 3 passages, annuler le 1er → les 2 autres intacts', async () => {
  const { app, page } = await ouvrir('sonal-journal-')
  const ed = page.locator('.editeur')

  await coder(page, 'Karine', 'Famille')
  await coder(page, 'Lyon', 'Lieu')
  await coder(page, 'retraite', 'Travail')
  await expect(ed.locator('.annot')).toHaveCount(3)

  // Journal : 3 entrées, la plus ancienne (1er codage) en DERNIER.
  await ongletJournal(page)
  const entrees = page.locator('.liste-journal li')
  await expect(entrees).toHaveCount(3)
  await expect(entrees.last()).toContainText('Codage posé : Famille')
  await entrees.last().locator('.annuler-entree').click()

  // Le 1er codage est annulé, les 2 autres sont INTACTS.
  await expect(ed.locator('.annot')).toHaveCount(2)
  await expect(ed.locator('.annot', { hasText: 'Karine' })).toHaveCount(0)
  await expect(ed.locator('.annot', { hasText: 'Lyon' })).toHaveCount(1)
  await expect(ed.locator('.annot', { hasText: 'retraite' })).toHaveCount(1)
  await expect(page.locator('.liste-journal li')).toHaveCount(2) // l'entrée est sortie
  await app.close()
})

test('annuler une attribution de locuteur → l’ancien loc restauré, la scission demeure', async () => {
  const { app, page } = await ouvrir('sonal-journal-')

  // Attribuer « Lyon » (sous-partie du bloc 1, loc 1) à Karine → scission, loc 2.
  await selectionner(page, 'Lyon')
  await page.locator('.onglets button[data-onglet="locuteurs"]').click()
  await expect(page.locator('.attribuer .lbl')).toHaveText('Attribuer le bloc courant ou la sélection :')
  await page.locator('.boutons-loc .attr', { hasText: 'Karine' }).click()
  await expect(page.locator('.editeur p')).toHaveCount(4)
  await expect(page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })).toHaveCount(1)

  // Journal → annuler l'attribution.
  await ongletJournal(page)
  const entree = page.locator('.liste-journal li', { hasText: 'Locuteur attribué : Karine' })
  await entree.locator('.annuler-entree').click()

  // L'ancien loc est restauré ; les 4 blocs restent (aucune fusion).
  await expect(page.locator('.editeur p[data-loc="2"]', { hasText: 'Lyon' })).toHaveCount(0)
  await expect(page.locator('.editeur p')).toHaveCount(4)
  await app.close()
})

test('une entrée dont la cible a disparu est grisée (non annulable)', async () => {
  const { app, page } = await ouvrir('sonal-journal-')
  const ed = page.locator('.editeur')

  // Coder puis retirer (toggle S3) : l'annotation du « posé » n'existe plus.
  await coder(page, 'Karine', 'Famille')
  await coder(page, 'Karine', 'Famille')
  await expect(ed.locator('.annot')).toHaveCount(0)

  await ongletJournal(page)
  const entrees = page.locator('.liste-journal li')
  await expect(entrees).toHaveCount(2)
  // « Codage posé » (le plus ancien) : sa cible a disparu → grisé, bouton désactivé.
  const posee = entrees.last()
  await expect(posee).toContainText('Codage posé')
  await expect(posee).toHaveClass(/grisee/)
  await expect(posee.locator('.annuler-entree')).toBeDisabled()
  // « Codage retiré » : annulable → l'annuler re-pose le codage.
  await entrees.first().locator('.annuler-entree').click()
  await expect(ed.locator('.annot')).toHaveText('Karine')
  await app.close()
})
