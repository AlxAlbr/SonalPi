/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { ClientWebDAV } from '../src/main/webdav/client'
import { corpusImportWebDAV, entretienImportWebDAV, documentsImportWebDAV, serviceImportWebDAV, preparationImportWebDAV } from '../test/fixtures/correspondancesWebDAV'
import { lancer, attendreAccueil, fermerAiguillage } from './util'

type Panne = 'aucune' | 'avant-e2' | 'reponse-e1'
type Sonde = { panne: Panne; accepte: boolean; publies: string[] }
async function instrumenter(app: ElectronApplication, racine: string, panne: Panne = 'aucune') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeCorrespondances: Sonde }
    const original = g.fetch
    g.sondeCorrespondances = { panne: args.panne, accepte: false, publies: [] }
    g.fetch = async (url, init) => {
      const adresse = url instanceof Request ? url.url : String(url)
      const methode = init?.method ?? (url instanceof Request ? url.method : 'GET')
      const cible = adresse.startsWith(`${args.racine}/entretiens/`)
      const id = cible && adresse.endsWith('.json') ? adresse.split('/').at(-1)! : ''
      const s = g.sondeCorrespondances
      if (s.panne === 'avant-e2' && id === 'e2.json' && methode === 'PUT') throw new Error('coupure synthétique')
      if (s.panne === 'reponse-e1' && s.accepte && id === 'e1.json' && methode === 'GET') throw new Error('relecture synthétique indisponible')
      const r = await original(url, init)
      if (id && methode === 'PUT' && r.ok) {
        s.publies.push(id)
        if (s.panne === 'reponse-e1' && id === 'e1.json') { s.accepte = true; await r.body?.cancel(); throw new Error('réponse synthétique perdue') }
      }
      return r
    }
  }, { racine, panne })
}
async function connecter(page: Page, url: string, nouveau: boolean) {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  if (nouveau) {
    await page.locator('.modale-distant input.champ').nth(0).fill(url)
    await page.locator('.modale-distant input.champ').nth(1).fill('max')
    await page.locator('.modale-distant input[type=password]').fill('max-max-1234')
    await page.locator('.modale-distant .valider').click()
  }
  await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 30_000 })
  const secrets = page.locator('.modale-distant .secret-compte')
  for (let n = 0; n < await secrets.count(); n++) await secrets.nth(n).fill('max-max-1234')
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  // Première ouverture de ce corpus sur le poste : l'aiguillage mène aux entretiens.
  await fermerAiguillage(page, 'entretiens', 120_000)
  await expect(page.locator('.corpus-ecran')).toBeVisible({ timeout: 90_000 })
}
async function dialogue(page: Page) {
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await page.getByRole('button', { name: 'Import règles', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Importer les correspondances', exact: true })
  await expect(modal).toBeVisible()
  return modal
}
async function preparer(page: Page) {
  const modal = await dialogue(page)
  await modal.getByLabel('Fichiers JSON').setInputFiles({ name: 'synthetique.json', mimeType: 'application/json', buffer: Buffer.from(documentsImportWebDAV[0].texte) })
  await expect(modal).toContainText('L’aperçu lit le serveur WebDAV')
  const cibles = modal.locator('table').nth(1).locator('tbody tr')
  await expect(cibles).toHaveCount(4, { timeout: 90_000 })
  const confirmer = modal.getByRole('button', { name: 'Confirmer l’import ciblé', exact: true })
  for (let n = 0; n < 4; n++) await cibles.nth(n).getByRole('checkbox').check()
  await expect(confirmer).toBeDisabled()
  await modal.getByLabel('Je confirme ces seuls entretiens et décisions.', { exact: false }).check()
  return { modal, confirmer }
}
async function banc(port: number) {
  const parent = new ClientWebDAV({ baseUrl: `http://localhost:${port}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/electron-correspondances-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  await client.putTexte('corpus.json', corpusImportWebDAV(), { ifNoneMatch: '*' })
  for (const id of ['e1', 'e2']) await client.putTexte(`entretiens/${id}.json`, entretienImportWebDAV(), { ifNoneMatch: '*' })
  const profil = mkdtempSync(join(tmpdir(), 'sonal-electron-correspondances-'))
  return { client, profil, nettoyer: async () => { await parent.supprimer(dossier); rmSync(profil, { recursive: true, force: true }) } }
}
for (const port of [8080, 8081]) test.describe(`correspondances WebDAV :${port}`, () => {
  test.beforeEach(async () => {
    test.setTimeout(240_000)
    const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
    test.skip(!pret, 'Banc Nextcloud absent.')
  })
  test('reprise après relance : journal privé, conflit refusé puis succès sans rejeu', async ({}, info) => {
    const b = await banc(port)
    let app: ElectronApplication | undefined
    try {
      app = await lancer(b.profil)
      await connecter(await app.firstWindow(), b.client.config.baseUrl, true)
      await app.close(); app = undefined
      const miroirs = join(b.profil, 'miroirs')
      const dir = join(miroirs, readdirSync(miroirs)[0])
      const client = new ClientWebDAV(b.client.config, async (url, init) => {
        if (init?.method === 'PUT' && String(url).endsWith('/entretiens/e2.json')) throw new Error('arrêt synthétique')
        return fetch(url, init)
      })
      const { service, store } = serviceImportWebDAV(client, dir, port === 8080)
      await expect(service.appliquer(preparationImportWebDAV(store, await service.instantane()))).rejects.toThrow('incomplet')
      const premier = await b.client.getTexte('entretiens/e1.json')
      const source = await b.client.getTexteAvecEtag('entretiens/e2.json')
      const concurrent = JSON.stringify({ ...JSON.parse(source.contenu), lastModified: '2026-12-01T00:00:00.000Z' })
      await b.client.putTexte('entretiens/e2.json', concurrent, { ifMatch: source.etag! })
      app = await lancer(b.profil, { preserverSettings: true })
      await instrumenter(app, b.client.config.baseUrl)
      const page = await app.firstWindow()
      await connecter(page, b.client.config.baseUrl, false)
      const modal = await dialogue(page)
      await expect(modal).toContainText('Import WebDAV à reprendre')
      await expect(modal).toContainText('Un envoi reste indéterminé')
      await expect(modal.locator('input[type=file]')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('reprise-webdav-normal.png') })
      await page.setViewportSize({ width: 760, height: 700 })
      await page.screenshot({ path: info.outputPath('reprise-webdav-reduit.png') })
      const reprise = modal.getByRole('button', { name: 'Reprendre l’import WebDAV', exact: true })
      await expect(reprise).toBeDisabled()
      const consentement = modal.getByLabel('Je confirme la reprise de ce lot préparé', { exact: false })
      await consentement.check(); await reprise.click()
      await expect(modal.getByRole('alert')).toContainText('Une source du plan a changé', { timeout: 90_000 })
      await expect(consentement).not.toBeChecked()
      expect(await b.client.getTexte('entretiens/e2.json')).toBe(concurrent)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeCorrespondances: Sonde }).sondeCorrespondances.publies)).toEqual([])
      // La source synthétique est restaurée hors application, uniquement pour terminer cette recette.
      const courant = await b.client.getTexteAvecEtag('entretiens/e2.json')
      await b.client.putTexte('entretiens/e2.json', source.contenu, { ifMatch: courant.etag! })
      await consentement.check(); await reprise.click()
      await expect(modal).not.toBeVisible({ timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(premier)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeCorrespondances: Sonde }).sondeCorrespondances.publies)).toEqual(['e2.json'])
    } finally { await app?.close(); await b.nettoyer() }
  })
  test('aperçu publié et sélection explicite : mémoire et Personne préservées', async ({}, info) => {
    const b = await banc(port)
    let app: ElectronApplication | undefined
    try {
      app = await lancer(b.profil)
      const page = await app.firstWindow()
      await connecter(page, b.client.config.baseUrl, true)
      const { modal, confirmer } = await preparer(page)
      await page.screenshot({ path: info.outputPath('import-webdav-normal.png') })
      await confirmer.click()
      await expect(modal).not.toBeVisible({ timeout: 90_000 })
      for (const id of ['e1', 'e2']) {
        const data = JSON.parse(await b.client.getTexte(`entretiens/${id}.json`))
        expect(data.corpsTexte).toEqual(JSON.parse(entretienImportWebDAV()).corpsTexte)
        expect(data.annotations).toEqual([])
        expect(data.locuteurs[0]).toMatchObject({ personneRef: 'personne-synthetique', pseudo: 'Claire', pseudoEtat: 'confirme' })
        expect(data.definitionsAnonLocales[0].entite).toEqual(['Alias sans occurrence', 'Autre graphie'])
      }
    } finally { await app?.close(); await b.nettoyer() }
  })
  for (const panne of ['avant-e2', 'reponse-e1'] as const) test(`publication interrompue ${panne} : IPC puis reprise après relance sans rejeu`, async () => {
    const b = await banc(port)
    let app: ElectronApplication | undefined
    try {
      app = await lancer(b.profil)
      await instrumenter(app, b.client.config.baseUrl, panne)
      let page = await app.firstWindow()
      await connecter(page, b.client.config.baseUrl, true)
      const { modal, confirmer } = await preparer(page)
      await confirmer.click()
      await expect(modal).toContainText('Import WebDAV à reprendre', { timeout: 90_000 })
      const premier = await b.client.getTexte('entretiens/e1.json')
      expect(JSON.parse(premier).locuteurs[0].pseudo).toBe('Claire')
      await app.close(); app = undefined
      app = await lancer(b.profil, { preserverSettings: true })
      await instrumenter(app, b.client.config.baseUrl)
      page = await app.firstWindow()
      await connecter(page, b.client.config.baseUrl, false)
      const reprise = await dialogue(page)
      await expect(reprise).toContainText('Import WebDAV à reprendre')
      const refus = await page.evaluate(async () => { try { await window.sonal.corpus.ouvrirEntretienPourEdition('e1'); return '' } catch (e) { return String(e) } })
      expect(refus).toContain('import WebDAV')
      await reprise.getByLabel('Je confirme la reprise de ce lot préparé', { exact: false }).check()
      await reprise.getByRole('button', { name: 'Reprendre l’import WebDAV', exact: true }).click()
      await expect(reprise).not.toBeVisible({ timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(premier)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeCorrespondances: Sonde }).sondeCorrespondances.publies)).toEqual(['e2.json'])
    } finally { await app?.close(); await b.nettoyer() }
  })
})
