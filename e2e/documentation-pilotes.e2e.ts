import { test, expect, type Page } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, fermerAiguillage, selectionner } from './util'
import { choisirDossierExemple, configurerSourcesExemples } from './exemples-util'

/** Les captures du manuel ne sont renouvelées que sur demande explicite. */
async function illustrer(page: Page, nom: string, hauteur?: number): Promise<void> {
  if (process.env.SONAL_DOC_CAPTURES !== '1') return
  mkdirSync('docs/user/medias', { recursive: true })
  const path = `docs/user/medias/${nom}.png`
  if (hauteur) await page.screenshot({ path, clip: { x: 0, y: 0, width: 1280, height: hauteur } })
  else await page.locator('.modale-nouveau').screenshot({ path })
}

async function accueil(page: Page): Promise<void> {
  await page.locator('.fil').getByRole('button', { name: 'Accueil', exact: true }).click()
  await attendreAccueil(page)
}

test('manuel : créer, retrouver et rouvrir un corpus local sans le remplacer', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-corpus-'))
  const profil = join(racine, 'profil')
  const dossier = join(racine, 'Enquete-associations')
  mkdirSync(profil)
  mkdirSync(dossier)
  writeFileSync(join(profil, 'settings.json'), '{}')
  const app = await lancer(profil, { preserverSettings: true })
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    await page.locator('.nouveau-corpus').click()
    await expect(page.locator('.modale-nouveau .valider')).toBeDisabled()
    await illustrer(page, 'nouveau-corpus-local')
    await page.locator('.modale-nouveau .annuler').click()
    expect(existsSync(join(dossier, 'corpus.json'))).toBe(false)

    await choisirDossierExemple(app, dossier)
    await page.locator('.nouveau-corpus').click()
    await page.locator('.choisir-dossier').click()
    await page.locator('#nom-nouveau-corpus').fill('Enquête dans les associations')
    await page.locator('.modale-nouveau .valider').click()
    await expect(page.locator('.espace-preparation')).toBeVisible()
    await fermerAiguillage(page)
    const lireCorpus = () => JSON.parse(readFileSync(join(dossier, 'corpus.json'), 'utf8'))
    expect(lireCorpus().nom).toBe('Enquête dans les associations')
    await illustrer(page, 'espaces-de-travail', 580)
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(page.locator('.carte-ent')).toHaveCount(0)

    await accueil(page)
    await expect(page.locator('.recents .recent-nom')).toHaveText('Enquete-associations')
    await page.locator('.recents .recent').click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await accueil(page)
    await page.locator('.nouveau-corpus').click()
    await page.locator('.choisir-dossier').click()
    await expect(page.locator('.deja-corpus')).toContainText('sans rien remplacer')
    await expect(page.locator('.modale-nouveau .valider')).toHaveText('Ouvrir')
    await page.locator('.modale-nouveau .valider').click()
    await expect(page.locator('.modale-nouveau')).not.toBeVisible()
    expect(lireCorpus().nom).toBe('Enquête dans les associations')

    await accueil(page)
    await page.locator('.oubli-recent').click()
    await expect(page.locator('.recents .recent')).toHaveCount(0)
    expect(existsSync(join(dossier, 'corpus.json'))).toBe(true)
    await page.locator('.ouvrir-corpus').click()
    await fermerAiguillage(page, 'entretiens', 10_000)
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    expect(lireCorpus().nom).toBe('Enquête dans les associations')
  } finally {
    await app.close()
  }
})

test('manuel : créer un thème et coder un passage sur sa copie du corpus exemple', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-doc-codage-'))
  const app = await lancer(join(racine, 'profil'))
  try {
    const page = await app.firstWindow()
    const fenetre = await app.browserWindow(page)
    await fenetre.evaluate((w) => w.setContentSize(1280, 900))
    await attendreAccueil(page)
    await configurerSourcesExemples(app, join(racine, 'sources'))
    await choisirDossierExemple(app, join(racine, 'exemple'))
    await page.locator('.carte-demo.exemples').click()
    await page.locator('.exemple').filter({
      has: page.getByRole('heading', { name: 'Entretiens déjà importés', exact: true }),
    }).getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await expect(page.locator('.installation-exemple')).toBeVisible()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Modifier…', exact: true }).click()
    await page.locator('.installation-exemple').getByRole('button', { name: 'Ouvrir ma copie', exact: true }).click()
    await expect(page.locator('.carte-ent')).toHaveCount(4)
    const carte = page.locator('.carte-ent').filter({ hasText: '1Coordinatrice' })
    await carte.locator('.crayon').click()
    await expect(page.locator('.editeur')).toContainText("surtout pour l'aide aux devoirs")
    await page.locator('[data-onglet="themes"]').click()
    await page.locator('.themes-coder .crayon').click()
    await page.locator('.modale-themes').getByRole('button', { name: '+ Thème', exact: true }).click()
    const nom = page.locator('.liste-thm li[data-nom="Nouveau thème"] .nom-thm')
    await nom.fill('Engagement bénévole')
    await nom.press('Enter')
    await expect(page.locator('.liste-thm li[data-nom="Engagement bénévole"]')).toBeVisible()
    await page.locator('.modale-themes .fermer').click()

    const phrase = "Je suis bénévole à la Maison des Habitants, surtout pour l'aide aux devoirs"
    await selectionner(page, phrase)
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe(phrase)
    const theme = page.locator('.theme-coder').filter({ hasText: 'Engagement bénévole' })
    const codage = page.locator('.editeur .annot[title="Engagement bénévole"]')
    await theme.click()
    await expect(codage).toHaveCount(1)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')
    await illustrer(page, 'premier-codage', 620)
    await theme.click()
    await expect(codage).toHaveCount(0)
    await theme.click()
    await expect(codage).toHaveCount(1)
    await expect(page.locator('.tete .etat')).toHaveText('à jour')

    await page.getByRole('button', { name: 'Préparer & Suivre', exact: true }).click()
    await expect(page.locator('.espace-preparation')).toBeVisible()
    await page.getByRole('button', { name: 'Importer & Traiter', exact: true }).click()
    await expect(codage).toHaveCount(1)
    await page.locator('.fil').getByRole('button', { name: /^Corpus/ }).click()
    await expect(page.locator('.corpus-ecran')).toBeVisible()
    await carte.locator('.crayon').click()
    await expect(codage).toHaveCount(1)
  } finally {
    await app.close()
  }
})
