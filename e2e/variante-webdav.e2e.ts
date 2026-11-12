import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { ClientWebDAV, ErreurHttp } from '../src/main/webdav/client'
import { ProviderFilesLock } from '../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../src/main/verrous/providerPutConditionnel'
import { fixtureRenommageAnon } from '../test/fixtures/renommageAnon'
import { lancer, attendreAccueil, fermerAiguillage } from './util'

type Sonde = { mode: 'normal' | 'perte' | 'kill'; accepte: boolean; publies: string[]; lecturesEntretiens: number }
async function instrumenter(app: ElectronApplication, racine: string, mode: Sonde['mode'] = 'normal') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeVarianteWebDAV: Sonde }, original = g.fetch
    g.sondeVarianteWebDAV = { mode: args.mode, accepte: false, publies: [], lecturesEntretiens: 0 }
    g.fetch = async (url, init) => {
      const adresse = url instanceof Request ? url.url : String(url), methode = init?.method ?? (url instanceof Request ? url.method : 'GET')
      const s = g.sondeVarianteWebDAV, corpus = adresse === `${args.racine}/corpus.crp`
      if (adresse.startsWith(`${args.racine}/entretiens/`) && methode === 'GET') s.lecturesEntretiens++
      if (s.mode === 'perte' && s.accepte && corpus && methode === 'GET') throw new Error('Relecture synthétique indisponible')
      const r = await original(url, init)
      if (methode === 'PUT' && r.ok && (corpus || adresse.startsWith(`${args.racine}/entretiens/`))) {
        s.publies.push(adresse.split('/').at(-1)!)
        if (corpus) {
          s.accepte = true
          if (s.mode === 'kill') { await r.body?.cancel(); await new Promise(() => {}) }
          if (s.mode === 'perte') { await r.body?.cancel(); throw new Error('Réponse synthétique perdue') }
        }
      }
      return r
    }
  }, { racine, mode })
}
async function connecter(page: Page, url: string, nouveau = true) {
  await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
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
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function editer(page: Page, entite = 'Karine', saisie = 'Claire / Rebecca') {
  await page.getByRole('button', { name: `Modifier les pseudonymes de ${entite}`, exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
  await modal.getByLabel('Pseudonymes', { exact: true }).fill(saisie); return modal
}
async function banc(port: number) {
  const base = `http://localhost:${port}`, parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/electron-variante-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
  const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  const f = fixtureRenommageAnon(); f.corpus.nom = 'Variantes synthétiques'; f.corpus.reglesAnon.personne.pseudos = ['Claire']
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  await client.putTexte('corpus.crp', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
  for (const s of f.sources) await client.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
  const profil = mkdtempSync(join(tmpdir(), 'sonal-variante-webdav-electron-'))
  // Aucun corpus local ne doit se charger pendant la première connexion distante.
  writeFileSync(join(profil, 'settings.json'), JSON.stringify({ recents: [] }), 'utf8')
  const tenir = async (id: string) => {
    const identite = { userId: 'olivier', machineId: 'autre-poste', sessionId: randomUUID() }
    const provider = id !== 'corpus' && port === 8080 ? new ProviderFilesLock(tiers, () => identite) : new ProviderPutConditionnel(tiers, () => identite)
    const chemin = id !== 'corpus' && port === 8080 ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true); return () => provider.liberer(chemin)
  }
  const sources = () => Promise.all(f.sources.map((s) => client.getTexteAvecEtag(`entretiens/${s.id}.json`)))
  const verrou = async () => { try { return await client.getTexteAvecEtag('verrous/corpus.lock.json') } catch (e) { if (e instanceof ErreurHttp && e.statut === 404) return null; throw e } }
  return { base, client, tiers, f, tenir, sources, verrou, lancement: () => lancer(profil, { preserverSettings: true }), relance: () => lancer(profil, { preserverSettings: true }),
    nettoyer: async () => { await parent.supprimer(dossier); rmSync(profil, { recursive: true, force: true }) } }
}
for (const port of [8080, 8081]) test.describe(`Ajout de variante WebDAV :${port}`, () => {
  test.beforeEach(async () => {
    test.setTimeout(240_000)
    const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
    test.skip(!pret, 'Banc Nextcloud absent.')
  })
  test('slash, annulation, corpus tenu puis ajout ; entretien du second compte intact', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined; const rendre = await b.tenir('e1')
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl)
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      const avant = await b.sources(); let modal = await editer(page)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(JSON.parse(await b.client.getTexte('corpus.crp')).reglesAnon.personne.pseudos).toEqual(['Claire'])
      const rendreCorpus = await b.tenir('corpus')
      try { modal = await editer(page); await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé'); await modal.getByRole('button', { name: 'Fermer', exact: true }).click() }
      finally { await rendreCorpus() }
      modal = await editer(page)
      await page.screenshot({ path: info.outputPath('variante-webdav-normale.png') }); await page.setViewportSize({ width: 760, height: 700 })
      await page.screenshot({ path: info.outputPath('variante-webdav-reduite.png') })
      await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / Rebecca / Troisième')
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('Deux pseudonymes maximum')
      await modal.getByLabel('Pseudonymes', { exact: true }).fill('Claire / Rebecca')
      await app.evaluate(() => { (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV.lecturesEntretiens = 0 })
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal).toBeHidden()
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
      const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
      expect(JSON.parse(await b.client.getTexte('corpus.crp'))).toEqual(attendu); expect(await b.sources()).toEqual(avant)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV)).toMatchObject({ publies: ['corpus.crp'], lecturesEntretiens: 0 })
    } finally { await rendre(); if (app) await app.close(); await b.nettoyer() }
  })
  test('définition distante changée : refus puis nouveau choix après actualisation', async () => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl); const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      let modal = await editer(page); const s = await b.tiers.getTexteAvecEtag('corpus.crp'), c = JSON.parse(s.contenu); c.reglesAnon.personne.categorie = 'Autre'
      await b.tiers.putTexte('corpus.crp', JSON.stringify(c, null, 2), { ifMatch: s.etag! })
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé')
      await modal.getByRole('button', { name: 'Fermer', exact: true }).click(); await page.locator('.synchro-zone button').click()
      await expect(page.locator('.synchro-zone button')).toBeEnabled()
      await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Karine' }).getByText('Autre', { exact: true })).toBeVisible()
      modal = await editer(page); await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal).toBeHidden()
      expect(JSON.parse(await b.client.getTexte('corpus.crp')).reglesAnon.personne).toMatchObject({ pseudos: ['Claire', 'Rebecca'], categorie: 'Autre' })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV.publies)).toEqual(['corpus.crp'])
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
  test('réponse perdue : nouvel envoi bloqué puis Actualiser reconnaît sans répétition', async () => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'perte'); const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      const avant = await b.sources(), modal = await editer(page)
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé')
      await expect(modal.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled()
      await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
      await app.evaluate(() => { (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV.mode = 'normal' })
      await page.locator('.synchro-zone button').click()
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
      expect(await b.sources()).toEqual(avant); expect(await b.verrou()).toBeNull()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV.publies)).toEqual(['corpus.crp'])
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
  test('SIGKILL après acceptation : reconnaissance sans rendre le droit ancien, autre ajout refusé', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'kill'); let page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      const avant = await b.sources(), modal = await editer(page)
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
      await expect.poll(() => app!.evaluate(() => (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV.accepte), { timeout: 90_000 }).toBe(true)
      const bail = (await b.verrou())!, detenteur = JSON.parse(bail.contenu)
      expect(detenteur.sessionId).toMatch(/^ajout-variante-/)
      const processus = app.process(), sortie = new Promise<NodeJS.Signals | null>((r) => processus.once('exit', (_code, signal) => r(signal)))
      processus.kill('SIGKILL'); expect(await sortie).toBe('SIGKILL'); app = undefined
      app = await b.relance(); await instrumenter(app, b.client.config.baseUrl); page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, false)
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
      expect(await b.verrou()).toEqual(bail); expect(await b.sources()).toEqual(avant)
      let autre = await editer(page, 'Ailleurs', 'Nouvelle / Alba')
      await autre.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(autre.getByRole('alert')).toContainText('n’a pas pu être confirmé')
      await page.screenshot({ path: info.outputPath('variante-webdav-bail-persistant.png') })
      await autre.getByRole('button', { name: 'Fermer', exact: true }).click()
      expect(await b.verrou()).toEqual(bail)
      const compte = await fetch(`${b.base}/ocs/v2.php/cloud/user?format=json`, { headers: { 'OCS-APIRequest': 'true', Authorization: `Basic ${Buffer.from('max:max-max-1234').toString('base64')}` } }).then((r) => r.json())
      expect(compte.ocs.data.id).toBe('max'); expect(detenteur.userId).toBe('max')
      expect(await b.verrou()).toEqual(bail)
      // Le banc a prouvé la mort du processus et la génération exacte ; ce n’est pas une action produit.
      await b.client.supprimer('verrous/corpus.lock.json', bail.etag!)
      autre = await editer(page, 'Ailleurs', 'Nouvelle / Alba'); await autre.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(autre).toBeHidden()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVarianteWebDAV: Sonde }).sondeVarianteWebDAV.publies)).toEqual(['corpus.crp'])
      expect(JSON.parse(await b.client.getTexte('corpus.crp')).reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca']); expect(await b.sources()).toEqual(avant)
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
})
