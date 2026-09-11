import { test, expect } from '@playwright/test'
import { ouvrir, selectionner } from './util'

test('rechercher, naviguer, remplacer et fermer la boîte', async () => {
  const { app, page } = await ouvrir('sonal-recherche-')

  await selectionner(page, 'Lyon')
  await page.keyboard.press('Control+f')

  const barre = page.locator('.barre-recherche')
  const recherche = page.locator('#champ-recherche')
  await expect(barre).toBeVisible()
  await expect(recherche).toBeFocused()
  await expect(recherche).toHaveValue('Lyon')
  await expect(barre.locator('.compte')).toHaveText('1/1')
  await expect(page.locator('.editeur .recherche-hit-active')).toHaveText('Lyon')

  await recherche.fill('de')
  await expect(barre.locator('.compte')).toHaveText('1/3')
  await barre.getByTitle('Occurrence précédente').click()
  await expect(barre.locator('.compte')).toHaveText('3/3')
  await barre.getByTitle('Occurrence suivante (Entrée)').click()
  await expect(barre.locator('.compte')).toHaveText('1/3')

  const remplacement = barre.getByPlaceholder('Remplacer par…')
  await remplacement.fill('ailleurs')
  await barre.getByTitle("Remplacer l'occurrence courante").click()
  await expect(barre.locator('.compte')).toHaveText('1/2')

  await remplacement.fill('XX')
  await barre.getByTitle('Remplacer toutes les occurrences (une seule annulation Ctrl+Z)').click()
  await expect(barre.locator('.compte')).toHaveText('0/0')
  await page.locator('.editeur').press('Control+z')
  await expect(barre.locator('.compte')).toHaveText('1/2')

  await recherche.press('Escape')
  await expect(barre).toHaveCount(0)
  await expect(page.locator('.editeur .recherche-hit, .editeur .recherche-hit-active')).toHaveCount(0)

  await app.close()
})
