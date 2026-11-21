import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus } from './util'

test('Préparation : ouverture sur le tableau de bord, message replié derrière l’icône info', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-preparation-tableau-'))
  const app = await lancer(profil, { executablePath: process.env.PREPARATION_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 800))
    await entrerCorpus(page)
    const fichiers = [join(profil, 'corpus/corpus.crp'), join(profil, 'corpus/entretiens/e1.json')]
    const avant = fichiers.map((f) => readFileSync(f, 'utf8'))
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    const espace = page.locator('.espace-preparation')
    const tableau = espace.locator('.tableau-bord')

    // Plus d'onglet Accueil : l'espace s'ouvre sur le tableau de bord.
    await expect(espace.locator('[data-tour="ouvrir-accueil-preparation"]')).toHaveCount(0)
    await expect(espace.locator('[data-tour="ouvrir-tableau-bord"]')).toHaveAttribute('aria-current', 'page')
    await expect(tableau).toBeVisible()

    // Le message sur l'organisation du travail est replié derrière l'icône info.
    const message = tableau.locator('.aide-tableau')
    await expect(message).toHaveCount(0)
    await tableau.getByRole('button', { name: 'À propos du tableau de bord' }).click()
    await expect(message).toContainText('peuvent conduire à une organisation linéaire et séquentielle')
    await expect(message).toContainText('Bonnes explorations et utilisations !')
    await tableau.getByRole('button', { name: 'À propos du tableau de bord' }).click()
    await expect(message).toHaveCount(0)

    // Pendant l'édition d'un intitulé, un rappel indique comment aller à la ligne.
    await tableau.locator('.entete-colonne .nom').first().click()
    await expect(tableau.locator('.aide-saisie')).toContainText('⇧ + Entrée')
    const saisie = tableau.locator('.saisie-nom')
    await saisie.click()
    await saisie.press('End')
    await saisie.press('Shift+Enter')
    await expect(saisie).toHaveValue(/\n$/)
    await page.keyboard.press('Escape')
    await expect(tableau.locator('.aide-saisie')).toHaveCount(0)

    // Le brouillon du tableau survit à un passage par un autre onglet.
    const titreLigne = espace.getByPlaceholder('Nom de la ligne…')
    await titreLigne.fill('Brouillon à conserver')
    await espace.locator('[data-tour="ouvrir-documents-exemples"]').click()
    await expect(tableau).toBeHidden()
    await espace.locator('[data-tour="ouvrir-tableau-bord"]').click()
    await expect(titreLigne).toHaveValue('Brouillon à conserver')

    await page.locator('[data-tour="ouvrir-traiter"]').click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    expect(fichiers.map((f) => readFileSync(f, 'utf8'))).toEqual(avant)
  } finally {
    await app.close()
  }
})
