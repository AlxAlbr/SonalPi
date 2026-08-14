import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus } from './util'

/**
 * Supprimer un entretien depuis l'écran Corpus : le ✕ d'une carte ouvre
 * une CONFIRMATION (même idiome de bannière que thèmes D-S10 et locuteurs), et la
 * suppression est une mise en `corbeille/` (le json déménage, rien n'est effacé).
 */

test('supprimer un entretien : Annuler ne fait rien ; confirmer → carte disparue, json en corbeille/', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sonal-suppr-'))
  const app = await lancer(dir)
  const page = await app.firstWindow()
  await entrerCorpus(page)

  // ✕ sur la carte seed → bannière de confirmation, rien n'est encore supprimé.
  await page.locator('.carte-ent .suppr').first().click()
  await expect(page.locator('.confirm-suppr')).toContainText('Entretien Karine')
  await page.locator('.confirm-suppr button', { hasText: 'Annuler' }).click()
  await expect(page.locator('.carte-ent')).toHaveCount(1)

  // ✕ puis Supprimer → la carte disparaît, le fichier part en corbeille/ (pas d'effacement).
  await page.locator('.carte-ent .suppr').first().click()
  await page.locator('.confirm-suppr .danger').click()
  await expect(page.locator('.carte-ent')).toHaveCount(0)
  await expect.poll(() => existsSync(join(dir, 'corpus', 'corbeille', 'e1.json'))).toBe(true)
  expect(existsSync(join(dir, 'corpus', 'entretiens', 'e1.json'))).toBe(false)

  await app.close()
})
