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

  await page.getByRole('button', { name: 'Analyser & Interpréter', exact: true }).click()
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

  await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
  await entrerEntretien(page)
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await page.locator('.recents .recent', { hasText: basename(autreCorpus) }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens' }))
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

  // Six onglets nommés ; les actions récentes ne sont plus proposées.
  const onglets = page.locator('.onglets-corpus button')
  await expect(onglets).toHaveCount(6)
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Actions récentes', exact: true })).toHaveCount(0)
  await expect(onglets.nth(1)).toHaveText('Notes')
  await expect(onglets.nth(2)).toHaveText('Personnes')
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: /Cas|Recueils|Journal|Exporter/ })).toHaveCount(0)
  await expect(page.locator('.onglets-corpus').getByRole('button', { name: 'Recherche', exact: true })).toHaveCount(0)
  await expect(page.locator('.onglets-corpus button.actif')).toHaveText('Entretiens')
  await expect(page.locator('.barre-onglet:visible')).toContainText('Ctrl+F')
  await expect(page.locator('.renvoi-organisation')).toContainText('Cas')
  await expect(page.locator('.cartes-ent')).toBeVisible()
  // Le premier entretien est sélectionné d'office : sa fiche occupe le panneau gauche, sans croix pour la fermer.
  const fiche = page.getByRole('complementary', { name: 'Fiche de l’entretien' })
  await expect(fiche).toBeVisible()
  await expect(page.locator('.carte-ent').first()).toHaveClass(/selection/)
  await expect(page.locator('.colonne-g-corpus .meta-ent')).toBeVisible()
  await expect(fiche.getByRole('button', { name: 'Fermer la fiche' })).toHaveCount(0)
  await expect(fiche.locator('.zone-sensible')).toContainText('Supprimer cet entretien du corpus')
  await expect(page.locator('.carte-ent .ouvrir-ent').first()).toHaveText('Ouvrir')
  // Ni un second clic sur l'entretien ni un clic ailleurs ne referment la fiche.
  await page.locator('.carte-ent .ent-titre').first().click()
  await page.locator('.barre-onglet:visible p').click()
  await expect(fiche).toBeVisible()
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Données' }).click()
  await expect(page.locator('.donnees-ecran')).toBeVisible()
  await expect(page.locator('.grille-corpus')).toBeHidden()
  await expect(page.locator('.fil')).not.toContainText('Table de données')
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Pseudonymisation' }).click()
  await expect(page.locator('.pseudo-panneau')).toBeVisible()
  await expect(page.locator('.grille-corpus')).toBeHidden()
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens' }).click()
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

  // L'entretien s'ouvre sur les locuteurs ; Ctrl+F ouvre la recherche à la demande.
  await expect(page.locator('[data-onglet="maison"]')).toHaveCount(0)
  await expect(page.locator('[data-onglet="locuteurs"]')).toHaveClass(/actif/)
  await page.locator('.editeur').click()
  await page.keyboard.press('ControlOrMeta+f')
  await expect(page.locator('.entretien-ecran .barre-recherche')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.entretien-ecran .barre-recherche')).toBeHidden()

  // Le bouton ferme l’entretien et revient au corpus.
  await expect(page.getByRole('button', { name: 'Exporter cet entretien', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Retour au niveau Corpus', exact: true }).click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.entretien-ecran')).toBeHidden()

  // Une nouvelle ouverture n'affiche pas de recherche spontanément.
  await entrerEntretien(page)
  await expect(page.locator('.entretien-ecran .barre-recherche')).toBeHidden()

  await app.close()
})
