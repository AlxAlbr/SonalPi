import { test, expect } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, retourCorpus } from './util'

test('manuel : renommer, trier, rechercher et corriger puis rouvrir le même entretien', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-doc-correction-')))
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await entrerCorpus(page)
    await page.locator('.carte-ent').first().click()
    await expect(page.locator('.meta-ent')).toBeVisible()
    await page.locator('.titre-meta').fill('Entretien de préparation')
    await page.locator('.titre-meta').blur()
    await expect(page.locator('.carte-ent .ent-titre').first()).toHaveText('Entretien de préparation')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await page.locator('.meta-ent').screenshot({ path: 'docs/user/medias/fiche-entretien.png' })
    }

    await page.locator('.ajout-ent').click()
    await page.locator('[data-tour="titre-entretien-vide"]').fill('Autre entretien')
    await page.locator('.modale-ajout .valider').click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await retourCorpus(page)
    await app.evaluate(({ Menu }) => {
      const entretiens = Menu.getApplicationMenu()!.items.find((item) => item.label === 'Entretiens')!
      const trier = entretiens.submenu!.items.find((item) => item.label === 'Trier les entretiens')!
      trier.submenu!.items.find((item) => item.label === 'Par ordre alphabétique')!.click()
    })
    await expect(page.locator('.carte-ent .ent-titre')).toHaveText(['Autre entretien', 'Entretien de préparation'])

    const carte = page.locator('.carte-ent').filter({ hasText: 'Entretien de préparation' })
    await carte.locator('.crayon').click()
    const editeur = page.locator('.editeur')
    await expect(editeur).toContainText('Lyon')
    await editeur.click()
    await page.keyboard.press('ControlOrMeta+f')
    await page.locator('#champ-recherche').fill('Lyon')
    const recherche = page.locator('.barre-recherche')
    await expect(recherche.locator('.compte')).toHaveText('1/1')
    await recherche.getByPlaceholder('Remplacer par…').fill('Villebourg')
    if (process.env.SONAL_DOC_CAPTURES === '1') {
      await recherche.screenshot({ path: 'docs/user/medias/rechercher-remplacer.png' })
    }
    await recherche.getByTitle("Remplacer l'occurrence courante", { exact: true }).click()
    await expect(editeur).toContainText('Villebourg')
    await expect(editeur).not.toContainText('Lyon')
    await page.locator('#champ-recherche').press('Escape')
    await expect(recherche).not.toBeVisible()
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await retourCorpus(page)
    await carte.locator('.crayon').click()
    await expect(editeur).toContainText('Villebourg')
    await expect(editeur).not.toContainText('Lyon')
  } finally {
    await app.close()
  }
})
