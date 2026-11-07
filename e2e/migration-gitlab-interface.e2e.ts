import { test, expect } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil, ouvrirMigration } from './util'

test('la modale de migration GitLab est centrée sur un voile couvrant la fenêtre', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-migration-gitlab-modale-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await expect(page.locator('.migrer-corpus')).toHaveCount(0)
    await expect(page.locator('.migrer-gitlab .carte-titre')).toHaveText(/Migration corpus GitLab\s*\(V1 → V2\)/)
    await expect(page.locator('.migrer-gitlab .carte-titre br')).toHaveCount(1)
    await ouvrirMigration(page, 'gitlab')
    const dialogue = page.getByRole('dialog', { name: 'Migration SonalPi1 — GitLab' })
    await expect(dialogue).toBeVisible()
    for (const taille of [{ width: 1000, height: 800 }, { width: 640, height: 480 }]) {
      await page.setViewportSize(taille)
      const disposition = await dialogue.evaluate((element) => {
        const voile = element.parentElement!
        const style = getComputedStyle(voile)
        const fond = voile.getBoundingClientRect()
        const cadre = element.getBoundingClientRect()
        return {
          position: style.position, display: style.display, alignement: style.alignItems, justification: style.justifyContent,
          x: fond.x, y: fond.y, largeur: fond.width, hauteur: fond.height,
          centreX: cadre.x + cadre.width / 2, centreY: cadre.y + cadre.height / 2,
          fenetreLargeur: document.documentElement.clientWidth, fenetreHauteur: document.documentElement.clientHeight,
        }
      })
      expect(disposition).toMatchObject({ position: 'fixed', display: 'flex', alignement: 'center', justification: 'center', x: 0, y: 0 })
      expect(disposition.largeur).toBe(disposition.fenetreLargeur)
      expect(disposition.hauteur).toBe(disposition.fenetreHauteur)
      expect(disposition.centreX).toBeCloseTo(disposition.fenetreLargeur / 2, 0)
      expect(disposition.centreY).toBeCloseTo(disposition.fenetreHauteur / 2, 0)
    }
    await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(dialogue).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(profil, { recursive: true, force: true })
  }
})

for (const mode of ['oauth', 'jeton-personnel'] as const) {
  test(`la migration réutilise un projet enregistré sans demander ses accès (${mode}, API simulée)`, async () => {
    const profil = mkdtempSync(join(tmpdir(), 'sonal-migration-connexion-'))
    const app = await lancer(profil)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await app.evaluate(({ ipcMain }, authentification) => {
        const urlInstance = 'https://gitlab.example.org'
        const compte = { id: 'compte', urlInstance, utilisateur: 'moi', authentification,
          connecte: true, aRafraichir: false, scopes: ['api'] }
        const projet = { compteId: compte.id, urlInstance, utilisateur: compte.utilisateur,
          projetId: 777, nomProjet: 'Terrain enregistré', branche: 'terrain' }
        for (const canal of ['gitlab:lister', 'gitlab:etat', 'gitlab:detecterInstance', 'gitlab:connecter',
          'gitlab:connecterAvecJeton', 'migrer:gitlab:decouvrir']) ipcMain.removeHandler(canal)
        ipcMain.handle('gitlab:lister', () => [{ fournisseur: 'gitlab', id: 'connue', ...projet,
          authentification, racine: '', connexionDisponible: true, baseMedia: null }])
        ipcMain.handle('gitlab:etat', () => ({ urlInstance, comptes: [compte], applicationConnue: true,
          uriCallback: 'http://127.0.0.1:7474/callback' }))
        for (const canal of ['gitlab:detecterInstance', 'gitlab:connecter', 'gitlab:connecterAvecJeton']) {
          ipcMain.handle(canal, () => { throw new Error('La source connue ne doit pas redemander une connexion.') })
        }
        ipcMain.handle('migrer:gitlab:decouvrir', (_e, demande) => {
          if (demande.destinationId !== 'connue') throw new Error('La source enregistrée doit être choisie par son identifiant.')
          return { preparationId: 'preparation-simulee', projet, commit: 'a'.repeat(40), corpus: ['terrain.crp'] }
        })
      }, mode)
      await ouvrirMigration(page, 'gitlab')
      const dialogue = page.getByRole('dialog', { name: 'Migration SonalPi1 — GitLab' })
      await dialogue.getByRole('combobox', { name: /^Projet source/ }).selectOption('connue')
      await expect(dialogue.getByText('Connecté : moi', { exact: true })).toBeVisible()
      await expect(dialogue.getByLabel('Adresse du projet source', { exact: true })).toHaveCount(0)
      await expect(dialogue.getByLabel('Client ID OAuth', { exact: true })).toHaveCount(0)
      await expect(dialogue.getByLabel('Jeton d’accès GitLab (scope api)', { exact: true })).toHaveCount(0)
      await dialogue.getByRole('button', { name: 'Lire la source', exact: true }).click()
      await expect(dialogue.getByText('Corpus : terrain.crp', { exact: true })).toBeVisible()
      await expect(dialogue.getByLabel('Adresse du nouveau projet GitLab', { exact: true })).toBeVisible()
      await dialogue.getByRole('combobox', { name: /^Projet source/ }).selectOption('')
      await expect(dialogue.getByLabel('Adresse du projet source', { exact: true })).toBeVisible()
      await expect(dialogue.getByLabel('Client ID OAuth', { exact: true })).toBeVisible()
      await expect(dialogue.getByText('Corpus : terrain.crp', { exact: true })).toHaveCount(0)
      await dialogue.getByRole('button', { name: 'Fermer', exact: true }).click()
    } finally {
      await app.close()
      rmSync(profil, { recursive: true, force: true })
    }
  })
}
