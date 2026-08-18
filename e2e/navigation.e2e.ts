import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, entrerEntretien } from './util'

/**
 * Enchaînement SonalPi : l'app DÉMARRE sur l'ACCUEIL, puis Corpus → Entretien.
 * Prouve que les trois écrans existent et que la navigation (cartes + fil d'Ariane +
 * bouton retour) bascule bien, l'éditeur restant monté (v-show) d'un écran à l'autre.
 */
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

  // Entretien → Corpus (bouton « ← Corpus » de la barre).
  await page.locator('.barre .retour').click()
  await expect(page.locator('.corpus-ecran')).toBeVisible()
  await expect(page.locator('.entretien-ecran')).toBeHidden()

  await app.close()
})
