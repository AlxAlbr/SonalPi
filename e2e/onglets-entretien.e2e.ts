import { test, expect } from '@playwright/test'
import { ouvrir } from './util'

test('les onglets de gauche affichent leur libellé sous l’icône dans la même police que Notes', async () => {
  const { app, page } = await ouvrir('sonal-libelles-onglets-')
  try {
    const boutons = page.locator('.colonne-gauche .onglets button')
    // Colonne étroite (largeur par défaut) : formes courtes.
    await expect(boutons.locator('span:visible')).toHaveText(['Locuteurs', 'Pseudo.', 'Thèmes', 'Comment.'])
    const reference = await page.locator('[data-onglet="notes"] span').evaluate((element) => {
      const style = getComputedStyle(element)
      return [style.fontFamily, style.fontSize, style.fontWeight]
    })
    for (const onglet of ['locuteurs', 'anon', 'themes', 'commentaires']) {
      const bouton = page.locator(`.colonne-gauche .onglets [data-onglet="${onglet}"]`)
      const libelle = bouton.locator('span:visible')
      await expect(libelle).toBeVisible()
      const presentation = await bouton.evaluate((element) => {
        const texte = [...element.querySelectorAll('span')].find((span) => span.offsetParent !== null)!
        const style = getComputedStyle(texte)
        return {
          police: [style.fontFamily, style.fontSize, style.fontWeight],
          sousIcone: texte.getBoundingClientRect().top >= element.querySelector('img')!.getBoundingClientRect().bottom,
          deborde: element.scrollWidth > element.clientWidth,
        }
      })
      expect(presentation.police).toEqual(reference)
      expect(presentation.sousIcone).toBe(true)
      expect(presentation.deborde).toBe(false)
      await bouton.click()
      await expect(bouton).toHaveClass(/actif/)
    }
    // Colonne assez large : les libellés complets prennent la place des courts.
    await page.evaluate(() => document.querySelector<HTMLElement>('.grille-ent')!.style.setProperty('--largeur-outils', '520px'))
    await expect(boutons.locator('span:visible')).toHaveText(['Locuteurs', 'Pseudonymisation', 'Thématiques', 'Commentaires'])
    for (const bouton of await boutons.all()) {
      expect(await bouton.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(false)
    }
  } finally {
    await app.close()
  }
})
