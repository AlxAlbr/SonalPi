import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus } from './util'

/**
 *  Supprimer un entretien depuis l'écran Corpus : le bouton « ❌ Supprimer »
 *  du panneau métadonnées ouvre une confirmation —
 *  même idiome de bannière que thèmes D-S10 et locuteurs.
 *  Parité SonalPi V1 : les cartes n'ont pas de croix.
 *  La suppression est une mise en `corbeille/` (le json déménage, rien n'est effacé).
 */

/** Sélectionne la carte (si le panneau n'est pas déjà ouvert),
 *  puis demande la suppression depuis le panneau.
 *  Un clic sur une carte DÉJÀ sélectionnée la désélectionnerait (re-clic = fermer).
 */
async function demanderSuppression(page: import('@playwright/test').Page) {
  const panneau = page.locator('.meta-ent')
  if (!(await panneau.isVisible().catch(() => false))) {
    await page.locator('.carte-ent').first().click()
    await expect(panneau).toBeVisible()
  }
  await page.locator('.meta-ent .suppr-meta').click()
}

test('supprimer un entretien : Annuler ne fait rien ; confirmer → carte disparue, json en corbeille/', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-suppr-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // Bouton du panneau → bannière de confirmation, rien n'est encore supprimé.
  await demanderSuppression(page)
  await expect(page.locator('.confirm-suppr')).toContainText('Entretien Karine')
  await page.locator('.confirm-suppr button', { hasText: 'Annuler' }).click()
  await expect(page.locator('.carte-ent')).toHaveCount(1)

  // Suppression confirmée → la carte disparaît, le fichier part en corbeille/ (pas d'effacement).
  await demanderSuppression(page)
  await page.locator('.confirm-suppr .danger').click()
  await expect(page.locator('.carte-ent')).toHaveCount(0)
  await expect.poll(() => existsSync(join(dir, 'corpus', 'corbeille', 'e1.json'))).toBe(true)
  expect(existsSync(join(dir, 'corpus', 'entretiens', 'e1.json'))).toBe(false)

  await app.close()
})
