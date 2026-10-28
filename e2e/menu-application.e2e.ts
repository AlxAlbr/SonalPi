import { test, expect, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, entrerCorpus, entrerEntretien } from './util'
import { choisirDossierExemple } from './exemples-util'

async function lireMenu(app: ElectronApplication) {
  return app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!
    const corpus = menu.items.find((item) => item.label === 'Corpus')!.submenu!
    const entretiens = menu.items.find((item) => item.label === 'Entretiens')!
    return {
      entretiens: entretiens.enabled,
      ajouter: entretiens.submenu!.items[0].enabled,
      trier: entretiens.submenu!.items[1].enabled,
      enregistrer: corpus.items.find((item) => item.label === 'Enregistrer')!.enabled,
      sauvegarder: corpus.items.find((item) => item.label.startsWith('Faire une copie'))!.enabled,
      exporter: corpus.items.find((item) => item.label === 'Exporter le corpus…')!.enabled,
    }
  })
}

const MENU_INACTIF = {
  entretiens: false, ajouter: false, trier: false,
  enregistrer: false, sauvegarder: false, exporter: false,
}

test('les menus suivent l’accueil, les espaces et l’entretien sans perdre le contexte aux récents', async () => {
  const app = await lancer(mkdtempSync(join(tmpdir(), 'sonal-menu-contexte-')))
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await expect.poll(() => lireMenu(app)).toEqual(MENU_INACTIF)

    await app.evaluate(({ BrowserWindow }) => {
      for (const action of ['ajouter-entretien', 'enregistrer', 'exporter-corpus', 'sauvegarde-zip']) {
        BrowserWindow.getAllWindows()[0].webContents.send('menu:action', action)
      }
    })
    await attendreAccueil(page)
    await expect(page.locator('.modale-ajout')).not.toBeVisible()
    await expect.poll(() => lireMenu(app)).toEqual(MENU_INACTIF)

    await entrerCorpus(page)
    await expect.poll(() => lireMenu(app)).toEqual({
      entretiens: true, ajouter: true, trier: false,
      enregistrer: false, sauvegarder: true, exporter: true,
    })
    await entrerEntretien(page)
    await expect.poll(() => lireMenu(app)).toMatchObject({ enregistrer: true })
    for (const nom of ['Préparer et suivre', 'Analyser et interpréter', 'Organiser et exporter', 'Importer et traiter']) {
      await page.getByRole('button', { name: nom, exact: true }).click()
      await expect.poll(() => lireMenu(app)).toMatchObject({ entretiens: true, enregistrer: true })
    }
    await page.locator('.fil').getByRole('button', { name: /^Corpus/ }).click()
    await expect.poll(() => lireMenu(app)).toMatchObject({ enregistrer: false })

    await page.evaluate(() => window.sonal.corpus.creerEntretienVide('Deuxième entretien'))
    await page.locator('.fil').getByRole('button', { name: 'Accueil', exact: true }).click()
    await expect.poll(() => lireMenu(app)).toEqual(MENU_INACTIF)
    await page.locator('.recents .recent').first().click()
    await expect(page.locator('.carte-ent')).toHaveCount(2)
    await expect.poll(() => lireMenu(app)).toMatchObject({ entretiens: true, trier: true, enregistrer: false })
    await page.locator('.fil').getByRole('button', { name: 'Accueil', exact: true }).click()
    await page.evaluate(() => window.sonal.corpus.recents())
    await expect.poll(() => lireMenu(app)).toEqual(MENU_INACTIF)
  } finally {
    await app.close()
  }
})

test('sans corpus puis avec un corpus vide, les commandes inutilisables restent grisées', async () => {
  const racine = mkdtempSync(join(tmpdir(), 'sonal-menu-vide-'))
  const profil = join(racine, 'profil')
  const dossier = join(racine, 'Mon-etude')
  mkdirSync(profil)
  mkdirSync(dossier)
  writeFileSync(join(profil, 'settings.json'), '{}')
  const app = await lancer(profil, { preserverSettings: true })
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await expect.poll(() => lireMenu(app)).toEqual(MENU_INACTIF)
    await choisirDossierExemple(app, dossier)
    await page.locator('.nouveau-corpus').click()
    await page.locator('.choisir-dossier').click()
    await page.locator('.modale-nouveau .valider').click()
    await expect(page.locator('.espace-preparation')).toBeVisible()
    await expect.poll(() => lireMenu(app)).toEqual({
      entretiens: true, ajouter: true, trier: false,
      enregistrer: false, sauvegarder: true, exporter: false,
    })
  } finally {
    await app.close()
  }
})
