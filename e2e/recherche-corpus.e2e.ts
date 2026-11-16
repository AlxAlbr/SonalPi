import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus } from './util'

test('choisir une occurrence déplie le transcript sous son entretien, avec le passage surligné', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-recherche-corpus-')))
  try {
    const page = await app.firstWindow()
    await entrerCorpus(page)
    await page.getByRole('button', { name: 'Rechercher dans tous les entretiens' }).click()
    await page.getByLabel('Rechercher dans le corpus').fill('Lyon')
    await page.getByLabel('Rechercher dans le corpus').press('Enter')
    await expect(page.locator('.occ-rech-btn').first()).toBeVisible()

    // Depuis le panneau de gauche : le transcript suit la carte, l'entretien reste fermé.
    await page.locator('.occ-rech-btn').first().click()
    const transcript = page.locator('.transcript-ent')
    await expect(transcript).toBeVisible()
    await expect(page.locator('.entretien-ecran')).toBeHidden()
    await expect(transcript.locator('mark.courante')).toHaveText('Lyon')
    await expect(page.locator('.carte-ent + .transcript-ent')).toHaveCount(1)
    await expect(page.locator('.occ-rech-btn.actif')).toHaveCount(1)
    await expect(page.locator('.occ-marqueur.courant')).toHaveCount(1)

    // Depuis une barre du mur d'ondes : même transcript, même occurrence.
    await page.getByRole('button', { name: 'Replier le transcript' }).click()
    await expect(transcript).toHaveCount(0)
    await page.locator('.occ-marqueur').first().click()
    await expect(transcript.locator('mark.courante')).toHaveText('Lyon')

    // Fermer la recherche replie le transcript et retire les marqueurs.
    await page.getByRole('button', { name: 'Fermer la recherche' }).click()
    await expect(transcript).toHaveCount(0)
    await expect(page.locator('.occ-marqueur')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
