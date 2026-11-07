import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, entrerCorpus, entrerEntretien } from './util'
import { intercepterOuverturesAide, lireOuverturesAide } from './aide-util'

const urlKit = 'https://logiquali-41533a.gitpages.huma-num.fr/'

test('accueil Préparation : introduction, kit externe et tableau réservé à son onglet', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-accueil-preparation-'))
  const app = await lancer(profil, { executablePath: process.env.PREPARATION_E2E_EXECUTABLE })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 800))
    await entrerCorpus(page)
    await entrerEntretien(page)
    const fichiers = [join(profil, 'corpus/corpus.crp'), join(profil, 'corpus/entretiens/e1.json')]
    const avant = fichiers.map((f) => readFileSync(f, 'utf8'))
    const urlApplication = page.url()
    await page.locator('[data-tour="ouvrir-preparer"]').click()
    const espace = page.locator('.espace-preparation')
    const introduction = espace.locator('.presentation-preparation')
    const tableau = espace.locator('.tableau-bord')
    await expect(espace.locator('[data-tour="ouvrir-accueil-preparation"]')).toHaveAttribute('aria-current', 'page')
    await expect(introduction).toContainText('Vous êtes dans l’onglet Accueil')
    await expect(introduction).toContainText('enquête quantitative')
    await expect(tableau).toBeHidden()
    const lien = introduction.getByRole('link', { name: urlKit, exact: true })
    await expect(lien).toHaveAttribute('href', urlKit)
    await intercepterOuverturesAide(app)
    await lien.focus()
    await page.keyboard.press('Enter')
    await expect.poll(async () => (await lireOuverturesAide(app)).sites).toEqual([urlKit])
    expect(page.url()).toBe(urlApplication)
    expect(await app.windows()).toHaveLength(1)
    await expect(introduction).toBeVisible()
    expect(fichiers.map((f) => readFileSync(f, 'utf8'))).toEqual(avant)
    await espace.screenshot({ path: 'test-results/accueil-preparation.png' })

    await espace.locator('.accueil-preparation').getByRole('button', { name: /^Tableau de bord/ }).click()
    await expect(tableau).toBeVisible()
    await expect(introduction).toBeHidden()
    const titreLigne = espace.getByPlaceholder('Nom de la ligne…')
    await titreLigne.fill('Brouillon à conserver')
    await espace.locator('[data-tour="ouvrir-accueil-preparation"]').click()
    await expect(introduction).toBeVisible()
    await expect(tableau).toBeHidden()
    await espace.locator('[data-tour="ouvrir-tableau-bord"]').click()
    await expect(titreLigne).toHaveValue('Brouillon à conserver')
    await page.locator('[data-tour="ouvrir-traiter"]').click()
    await expect(page.locator('.entretien-ecran')).toBeVisible()
    await expect(page.locator('.editeur')).toContainText('Karine')
    expect(fichiers.map((f) => readFileSync(f, 'utf8'))).toEqual(avant)
  } finally {
    await app.close()
  }
})
