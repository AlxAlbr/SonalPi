import { expect, test } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrerCorpus, entrerEntretien, lancer } from './util'

test('l’onglet Notes suit Accueil, modifie et supprime une note locale avec annulation', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-notes-corpus-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  const ordre = await page.locator('.onglets-corpus > button').evaluateAll((boutons) =>
    boutons.map((bouton) => bouton.getAttribute('title')),
  )
  expect(ordre.slice(0, 7)).toEqual([
    'Accueil', 'Notes', 'Personnes', 'Pseudonymisation', 'Thèmes', 'Données', 'Journal',
  ])

  await entrerEntretien(page)
  await page.locator('.onglets button[data-onglet="notes"]').click()
  await page.locator('button.mini', { hasText: '+ Note' }).click()
  await page.locator('.champ-titre-note input').fill('Note initiale')
  await page.locator('.zone-corps-note').fill('Corps initial')
  await page.locator('.modale-note-pied .principal').click()

  // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
  const carte = page.locator('.notes-corpus .carte-note', { hasText: 'Note initiale' })
  await expect(carte).toBeVisible()
  await expect(page.getByRole('button', { name: /Cartes/ })).toHaveAttribute('aria-pressed', 'true')

  await carte.getByRole('button', { name: /Modifier la note/ }).click()
  const modale = page.locator('.modale-note[role="dialog"]')
  await expect(modale).toBeVisible()
  await modale.getByLabel('Titre').fill('Note modifiée')
  await modale.getByRole('button', { name: 'Valider' }).click()
  await expect(page.locator('.notes-corpus .carte-note', { hasText: 'Note modifiée' })).toBeVisible()

  await page.locator('.onglets-corpus button[data-onglet="journal"]').click()
  const entree = page.locator('.journal-corpus .entrees-journal li', { hasText: 'Note modifiée' })
  await expect(entree).toBeVisible()
  await entree.locator('.annuler-action').click()

  await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
  const carteRestauree = page.locator('.notes-corpus .carte-note', { hasText: 'Note initiale' })
  await expect(carteRestauree).toBeVisible()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain("Supprimer la note 'Note initiale'")
    await dialog.accept()
  })
  await carteRestauree.getByRole('button', { name: /Supprimer la note/ }).click()
  await expect(carteRestauree).toHaveCount(0)

  await page.locator('.onglets-corpus button[data-onglet="journal"]').click()
  const suppression = page.locator('.journal-corpus .entrees-journal li', { hasText: 'Note supprimée' })
  await expect(suppression).toBeVisible()
  await suppression.locator('.annuler-action').click()
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Notes', exact: true }).click()
  await expect(page.locator('.notes-corpus .carte-note', { hasText: 'Note initiale' })).toBeVisible()

  await page.getByPlaceholder('Titre, corps, catégorie…').fill('Note initiale')
  await page.evaluate(() => {
    const etat = window as Window & { __exportNotes?: { nom?: string; contenu?: string } }
    etat.__exportNotes = {}
    URL.createObjectURL = (blob: Blob) => {
      void blob.text().then((contenu) => { etat.__exportNotes!.contenu = contenu })
      return 'blob:export-notes-test'
    }
    URL.revokeObjectURL = () => {}
    HTMLAnchorElement.prototype.click = function () {
      etat.__exportNotes!.nom = this.download
    }
  })
  await page.getByRole('button', { name: 'Exporter les notes filtrées en Markdown' }).click()
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __exportNotes?: { nom?: string } }).__exportNotes?.nom,
  )).toMatch(/^notes_.+_\d{4}-\d{2}-\d{2}\.md$/)
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __exportNotes?: { contenu?: string } }).__exportNotes?.contenu,
  )).toContain('# Notes du corpus')
  const markdown = await page.evaluate(() =>
    (window as Window & { __exportNotes?: { contenu?: string } }).__exportNotes?.contenu ?? '',
  )
  expect(markdown).toContain('# Notes du corpus')
  expect(markdown).toContain('Note initiale')
  expect(markdown).toContain('Corps initial')
  expect(markdown).not.toContain('<script')

  // Le bouton de MODE « 📊 Tableau » (affichage) est propre à l'outil Notes ;
  // sans le scoper, le « 📊 Tableau de bord » de la barre d'outils biaise le rôle.
  await page.locator('.notes-corpus').getByRole('button', { name: '📊 Tableau' }).click()
  await expect(page.locator('.notes-corpus .tableau-notes')).toBeVisible()
  const ligne = page.locator('.tableau-notes tbody tr', { hasText: 'Note initiale' })
  await expect(ligne).toBeVisible()
  await ligne.getByRole('button', { name: /Modifier la note/ }).click()
  await expect(page.locator('.modale-note[role="dialog"]')).toBeVisible()
  await page.locator('.modale-note').getByRole('button', { name: 'Annuler' }).click()

  await ligne.locator('.entretien').click()
  await expect(page.locator('.entretien-ecran')).toBeVisible()
  // Retour au corpus par le fil d'Ariane (pas de bouton « ← Corpus » dans la barre).
  await page.locator('.fil .lien-nav', { hasText: 'Corpus' }).click()
  await expect(page.locator('.notes-corpus .tableau-notes')).toBeVisible()
  await expect(page.locator('.notes-corpus').getByRole('button', { name: '📊 Tableau' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: /Feuille/ }).click()
  await expect(page.locator('.notes-corpus .feuille-notes')).toBeVisible()
  await expect(page.locator('.bloc-feuille-note .corps-note-complet')).toContainText('Corps initial')
  await app.close()
})
