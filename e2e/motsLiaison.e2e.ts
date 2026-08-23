import { test, expect } from '@playwright/test'
import { ouvrir, compterAnnotations } from './util'

/**
 * Mots de liaison / articles (4b-B) : à la validation d'une entité à affixe
 * (« à Lyon »), la modale propose la règle générale (« Lyon ») à la MÊME
 * portée. Jamais automatique :
 *  - « Oui » crée la règle et pose les occurrences de « Lyon » (le geste
 *    standard) ;
 *  - « Non » ne crée rien et ne mémorise aucun refus ;
 *  - une fois « Lyon » existant, plus AUCUNE re-proposition (« de Lyon », …).
 */

async function validerLigne(
  page: import('@playwright/test').Page,
  entite: string,
  pseudo: string,
) {
  const ligne = page.locator('.ligne-anon.saisie-anon').first()
  await ligne.locator('.nom-saisie').fill(entite)
  await ligne.locator('.pseudo-anon').fill(pseudo)
  await ligne.locator('.pseudo-anon').press('Enter')
}

test('validation de « à Lyon » → modale, Oui crée « Lyon » ; « de Lyon » ne re-propose PAS', async () => {
  const { app, page } = await ouvrir('sonal-liais-')
  const ed = page.locator('.editeur')

  // Texte du scénario : deux occurrences de « Lyon », dont une avec affixe différente.
  await ed.click({ position: { x: 6, y: 14 } })
  await page.keyboard.type('J’habite à Lyon et je suis de Lyon.')

  // Ouvrir le panneau Pseudonymisation et valider « à Lyon » (Entrée → corpus).
  await page.locator('[data-onglet="anon"]').click()
  await validerLigne(page, 'à Lyon', 'dans une grande ville')

  // La modale propose l'entité-cœur avec son pseudo rogner (« dans » seul est
  // un mot de liaison de la liste — « une » n'en fait pas partie).
  const modale = page.locator('.portee-dialogue')
  await expect(modale).toBeVisible({ timeout: 10_000 })
  await expect(modale).toContainText('Pseudonymiser aussi : « Lyon » ?')
  await expect(modale).toContainText('une grande ville')

  // « Oui » : la règle-cœur est créée à la même portée (corpus), les
  // occurrences de « Lyon » sont posées par le geste standard.
  await modale.locator('button', { hasText: 'Oui' }).click()
  await expect(modale).not.toBeVisible()
  await expect(page.locator('.nom-anon', { hasText: /^Lyon$/ })).toBeVisible()

  // Occurrences : « à Lyon » + les « Lyon » nus du texte (2ᵉ phrase ET phrase
  // « Karine habite Lyon » du texte de démo). Le « Lyon » sous « à Lyon » était
  // déjà couvert en entier → pas de doublon.
  expect(await compterAnnotations(page)).toBe(3)

  // Re-validation avec une AUTRE affixe : « Lyon » existe déjà → aucune
  // nouvelle modale, la règle se crée en silence.
  await validerLigne(page, 'de Lyon', 'd’une grande ville')
  await expect(modale).not.toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.nom-anon', { hasText: /^de Lyon$/ })).toBeVisible()

  await app.close()
})

test('« Non » ne crée rien et ne mémorise aucun refus', async () => {
  const { app, page } = await ouvrir('sonal-liais-n-')
  const ed = page.locator('.editeur')

  await ed.click({ position: { x: 6, y: 14 } })
  await page.keyboard.type('Je passe sur Paris toute la semaine.')

  await page.locator('[data-onglet="anon"]').click()
  await validerLigne(page, 'sur Paris', 'une grande métropole')

  const modale = page.locator('.portee-dialogue')
  await expect(modale).toBeVisible({ timeout: 10_000 })
  await expect(modale).toContainText('Pseudonymiser aussi : « Paris » ?')

  // « Non » : rien n'est créé ni mémorisé — seule l'entité validée existe.
  await modale.locator('button', { hasText: 'Non' }).click()
  await expect(modale).not.toBeVisible()
  await expect(page.locator('.nom-anon', { hasText: /^Paris$/ })).toHaveCount(0)
  expect(await compterAnnotations(page)).toBe(1) // « sur Paris » seule

  await app.close()
})
