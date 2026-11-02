import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { lancer, attendreAccueil, ecrireSeedDemo, entrerEntretien, fermerAiguillage } from './util'

/**
 *  Enchaînement SonalPi1 : l'app DÉMARRE sur l'ACCUEIL, puis Corpus → Entretien.
 *  Prouve que les trois écrans existent et que la navigation (cartes + fil d'Ariane +
 *  bouton retour) bascule bien, l'éditeur restant monté (v-show) d'un écran à l'autre.
 */
test('un projet neuf ouvre la préparation puis reprend le dernier espace consulté', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-nav-projet-'))
  const autreCorpus = mkdtempSync(join(tmpdir(), 'sonal-nav-nouveau-'))
  ecrireSeedDemo(autreCorpus)
  let app = await lancer(profil)
  let page = await app.firstWindow()

  await attendreAccueil(page)
  await app.evaluate(({ dialog }, dossier) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dossier] })
  }, autreCorpus)
  await page.locator('.carte-demo.ouvrir-corpus').click()
  await fermerAiguillage(page)

  await expect(page.locator('.espace-preparation')).toBeVisible()
  await expect(page.locator('[data-tour="ouvrir-accueil-preparation"]')).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Analyser et interpréter', exact: true }).click()
  await page.locator('[data-tour="ouvrir-lexico"]').click()
  await expect(page.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')

  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await page.locator('.recents .recent', { hasText: basename(autreCorpus) }).click()
  await expect(page.locator('.espace-analyse')).toBeVisible()
  await expect(page.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')

  await app.close()
  app = await lancer(profil, { preserverSettings: true })
  page = await app.firstWindow()
  await attendreAccueil(page)
  await page.locator('.recents .recent', { hasText: basename(autreCorpus) }).click()
  await expect(page.locator('.espace-analyse')).toBeVisible()
  await expect(page.locator('[data-tour="ouvrir-lexico"]')).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Importer et traiter', exact: true }).click()
  await entrerEntretien(page)
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await page.locator('.recents .recent', { hasText: basename(autreCorpus) }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil' }))
    .toHaveAttribute('aria-current', 'page')

  await app.close()
})

test('démarrage sur Accueil, puis Accueil ↔ Corpus ↔ Entretien', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-nav-')))
  const page = await app.firstWindow()

  // Au lancement : ACCUEIL (pas Corpus).
  await attendreAccueil(page)
  await expect(page.locator('.corpus-ecran')).toBeHidden()

  // Accueil → Corpus (1er récent = corpus courant).
  await page.locator('.recents .recent').first().click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.entretien-ecran')).toBeHidden()

  // Les six onglets du corpus sont complétés par l'accès aux actions récentes.
  const onglets = page.locator('.onglets-corpus button')
  await expect(onglets).toHaveCount(7)
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Actions récentes', exact: true })).toBeVisible()
  await expect(onglets.nth(1)).toHaveAttribute('aria-label', 'Notes')
  await expect(onglets.nth(2)).toHaveAttribute('aria-label', 'Personnes')
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: /Cas|Recueils|Journal|Exporter/ })).toHaveCount(0)
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Recherche', exact: true })).toHaveCount(0)
  await expect(page.locator('.onglets-corpus button.actif')).toHaveAttribute('aria-label', 'Accueil')
  await expect(page.locator('.accueil-corpus h3')).toHaveText('Importer et traiter')
  await expect(page.locator('.accueil-corpus .accueil-intro')).toHaveText('Niveau Corpus')
  await expect(page.locator('.accueil-corpus')).toContainText('Données')
  await expect(page.locator('.accueil-corpus')).toContainText('Pseudonymisation')
  await expect(page.locator('.accueil-corpus')).toContainText('Cas')
  await expect(page.locator('.accueil-corpus .raccourci')).toContainText('Ctrl+F / Cmd+F')
  await expect(page.locator('.accueil-corpus .accueil-outils')).not.toContainText('Recherche')
  await expect(page.locator('.cartes-ent')).toBeVisible()
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Données' }).click()
  await expect(page.locator('.donnees-ecran')).toBeVisible()
  await expect(page.locator('.grille-corpus')).toBeHidden()
  await expect(page.locator('.fil')).not.toContainText('Table de données')
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil' }).click()
  await page.locator('.accueil-corpus .accueil-outils').getByRole('button', { name: /^Pseudonymisation/ }).click()
  await expect(page.locator('.pseudo-panneau')).toBeVisible()
  await expect(page.locator('.grille-corpus')).toBeHidden()
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil' }).click()
  await expect(page.locator('.cartes-ent')).toBeVisible()
  await expect(page.locator('.pseudo-panneau')).toBeHidden()

  // Corpus → Accueil (fil d'Ariane) → Corpus.
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await expect(page.locator('.ecran.accueil')).toBeVisible()
  await expect(page.locator('.corpus-ecran')).toBeHidden()
  await page.locator('.recents .recent').first().click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()

  // Corpus → Entretien (ouvrir un entretien) : l'éditeur devient visible.
  await entrerEntretien(page)
  await expect(page.locator('.entretien-ecran')).toBeVisible()
  await expect(page.locator('.editeur')).toContainText('Karine')
  await expect(page.locator('.fil .lien-nav.courant')).toContainText('Karine')

  // Les cartes de l'accueil ouvrent aussi les onglets de l'entretien.
  await page.locator('.maison .liste-tours').getByRole('button', { name: /^Notes/ }).click()
  await expect(page.locator('[data-onglet="notes"]')).toHaveClass(/actif/)
  await expect(page.locator('aside.panneau.notes')).toBeVisible()

  // Le bouton ferme l’entretien et revient au corpus.
  await expect(page.getByRole('button', { name: 'Exporter cet entretien', exact: true })).toHaveCount(0)
  await expect(page.locator('.entretien-ecran .barre')).toHaveCount(0)
  await page.locator('.fil').getByRole('button', { name: /Retour au corpus/ }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.entretien-ecran')).toBeHidden()

  await app.close()
})
