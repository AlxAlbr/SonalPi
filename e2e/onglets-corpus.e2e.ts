import { test, expect } from '@playwright/test'
import { ouvrirSurCorpus } from './util'

for (const largeur of [760, 960, 1280]) {
  test(`les sept onglets du corpus restent accessibles à ${largeur} px`, async () => {
    const { app, page } = await ouvrirSurCorpus('sonal-onglets-corpus-')
    try {
      await page.setViewportSize({ width: largeur, height: 900 })
      const navigation = page.getByRole('navigation', { name: 'Navigation du corpus' })
      for (const nom of ['Entretiens', 'Locuteurs', 'Pseudonymisation', 'Thèmes', 'Commentaires', 'Notes', 'Données']) {
        const onglet = navigation.getByRole('button', { name: nom, exact: true })
        await expect(onglet).toBeInViewport({ ratio: 1 })
        await onglet.click()
        await expect(onglet).toHaveAttribute('aria-current', 'page')
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      await expect(page.getByRole('button', { name: 'Renommer le corpus', exact: true })).toBeInViewport({ ratio: 1 })
    } finally {
      await app.close()
    }
  })
}
