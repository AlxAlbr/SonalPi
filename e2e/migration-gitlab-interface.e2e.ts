import type {} from '../src/renderer/env'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { lancer, attendreAccueil } from './util'

async function simuler(app: ElectronApplication, options: { mode?: 'oauth' | 'jeton-personnel'; plusieurs?: boolean; reprise?: 'copie' | 'ouverture' | 'terminee' } = {}) {
  await app.evaluate(({ ipcMain }, options) => {
    const compte = { id: 'compte', urlInstance: 'https://gitlab.example.org', utilisateur: 'moi', authentification: options.mode ?? 'oauth', connecte: true, aRafraichir: false, scopes: ['api'] }
    const projet = { compteId: compte.id, urlInstance: compte.urlInstance, utilisateur: compte.utilisateur, projetId: 777, nomProjet: 'Terrain enregistré', branche: 'terrain' }
    const source = { preparationId: 'preparation-figee', projet, commit: 'a'.repeat(40), corpus: options.plusieurs ? ['terrain.crp', 'autre.crp'] : ['terrain.crp'] }
    const handler = (nom: string, fn: (...args: any[]) => any) => { ipcMain.removeHandler(nom); ipcMain.handle(nom, fn) }
    handler('gitlab:lister', () => [{ fournisseur: 'gitlab', id: 'connue', ...projet, authentification: compte.authentification, racine: '', connexionDisponible: true, baseMedia: null }])
    handler('gitlab:etat', () => ({ urlInstance: compte.urlInstance, comptes: [compte], applicationConnue: true, uriCallback: 'http://127.0.0.1:7474/callback' }))
    handler('gitlab:detecterInstance', () => compte.urlInstance)
    handler('gitlab:preparerProjet', () => projet)
    handler('gitlab:ouvrir', () => ({ type: 'migration', source }))
    handler('gitlab:enregistrerEtOuvrir', () => ({ type: 'migration', source }))
    for (const nom of ['gitlab:connecter', 'gitlab:connecterAvecJeton', 'migrer:gitlab:decouvrir']) {
      handler(nom, () => { throw new Error('La source connue ne doit pas être redemandée.') })
    }
    handler('migrer:gitlab:abandonner', (_e, id) => { if (id !== source.preparationId) throw new Error('Mauvaise préparation') })
    handler('migrer:gitlab:listerSuivis', () => options.reprise ? [{ operationId: 'migration-suivie', phase: options.reprise,
      mediasConfirmes: 1, publicationsConfirmees: 1, publicationsTotal: 1,
      bilan: { apercu: { nom: 'Enquête à reprendre' }, cible: { nomProjet: 'Destination V2' }, medias: [{}], destinationMedia: 'depot' } }] : [])
    handler('migrer:gitlab:reprendre', (_e, id, confirme) => {
      if (id !== 'migration-suivie' || confirme !== true) throw new Error('Reprise incorrecte')
      return { etat: 'interrompue', operationId: id, message: 'Reprise vérifiée sans relire la source.' }
    })
    handler('migrer:gitlab:preparer', (_e, demande) => {
      if (demande.preparationId !== source.preparationId || demande.cible.compteId !== compte.id) throw new Error('Source ou compte perdu')
      throw new Error('Destination reçue avec la source déjà préparée.')
    })
  }, options)
}
async function ouvrirGitLab(page: Page) {
  await page.locator('.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab', exact: true }).click()
}

for (const mode of ['oauth', 'jeton-personnel'] as const) {
  test(`ouvrir un V1 enregistré propose le passage prérempli, sans reconnexion (${mode})`, async () => {
    const profil = mkdtempSync(join(tmpdir(), 'sonal-ouverture-v1-gitlab-'))
    const app = await lancer(profil)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await simuler(app, { mode })
      await expect(page.locator('.migration-bloc, .migrer-gitlab')).toHaveCount(0)
      const avant = readFileSync(join(profil, 'corpus', 'corpus.crp'))
      await ouvrirGitLab(page)
      await page.locator('.modale-distant .comptes .ouvrir').click()
      const modal = page.getByRole('dialog', { name: 'Passer à SonalPi2 — GitLab' })
      await expect(modal).toBeVisible()
      await expect(page.locator('.modale-distant')).toHaveCount(0)
      await expect(modal).toContainText('Terrain enregistré')
      await expect(modal).toContainText('Corpus : terrain.crp')
      await expect(modal.getByLabel('Adresse du projet source')).toHaveCount(0)
      await expect(modal.getByLabel('Client ID OAuth')).toHaveCount(0)
      await modal.getByLabel('Adresse du nouveau projet GitLab').fill('https://gitlab.example.org/groupe/v2')
      await modal.getByRole('button', { name: 'Préparer le bilan' }).click()
      await expect(modal.getByRole('alert')).toContainText('source déjà préparée')
      await app.evaluate(({ app }, chemin) => { app.emit('open-file', { preventDefault() {} }, chemin) }, join(profil, 'inexistant.crp'))
      await expect(page.locator('.banniere.info')).toContainText('Une ouverture est déjà en cours')
      await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
      await expect(modal).toHaveCount(0)
      expect(readFileSync(join(profil, 'corpus', 'corpus.crp'))).toEqual(avant)
      await expect(page.locator('.banniere.refus')).toHaveCount(0)
      await ouvrirGitLab(page)
      await expect(page.locator('.modale-distant')).toBeVisible()
    } finally { await app.close(); rmSync(profil, { recursive: true, force: true }) }
  })
}

test('ouvrir un nouveau projet V1 conserve la source et demande un choix entre ses CRP', async () => {
  const profil = mkdtempSync(join(tmpdir(), 'sonal-ouverture-v1-adresse-'))
  const app = await lancer(profil)
  try {
    const page = await app.firstWindow()
    await attendreAccueil(page)
    await simuler(app, { plusieurs: true })
    await ouvrirGitLab(page)
    await page.locator('.url-projet-gitlab').fill('https://gitlab.example.org/groupe/source')
    await page.locator('.action-gitlab').click()
    const modal = page.getByRole('dialog', { name: 'Passer à SonalPi2 — GitLab' })
    await expect(modal).toBeVisible()
    await expect(modal.getByLabel('Corpus à migrer')).toHaveValue('')
    await modal.getByLabel('Adresse du nouveau projet GitLab').fill('https://gitlab.example.org/groupe/v2')
    await expect(modal.getByRole('button', { name: 'Préparer le bilan' })).toBeDisabled()
    await modal.getByLabel('Corpus à migrer').selectOption('autre.crp')
    await expect(modal.getByRole('button', { name: 'Préparer le bilan' })).toBeEnabled()
  } finally { await app.close(); rmSync(profil, { recursive: true, force: true }) }
})

for (const phase of ['copie', 'ouverture', 'terminee'] as const) {
  test(`la reprise ${phase} reste accessible depuis l’ouverture GitLab sans source V1`, async () => {
    const profil = mkdtempSync(join(tmpdir(), 'sonal-reprise-entree-gitlab-'))
    const app = await lancer(profil)
    try {
      const page = await app.firstWindow()
      page.on('dialog', (dialogue) => dialogue.accept())
      await attendreAccueil(page)
      await simuler(app, { reprise: phase })
      await ouvrirGitLab(page)
      await page.getByRole('button', { name: 'Reprendre un passage à SonalPi2…' }).click()
      const modal = page.getByRole('dialog', { name: 'Reprendre un passage à SonalPi2', exact: true })
      await expect(modal).toBeVisible()
      await expect(page.locator('.modale-distant')).toHaveCount(0)
      await expect(modal.getByLabel('Adresse du nouveau projet GitLab')).toHaveCount(0)
      await modal.getByRole('button', { name: phase === 'copie' ? 'Vérifier et reprendre' : 'Ouvrir le corpus', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('Reprise vérifiée sans relire la source')
    } finally { await app.close(); rmSync(profil, { recursive: true, force: true }) }
  })
}
