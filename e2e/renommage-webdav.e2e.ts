/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { ClientWebDAV } from '../src/main/webdav/client'
import { ProviderFilesLock } from '../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../src/main/verrous/providerPutConditionnel'
import { fixtureRenommageAnon } from '../test/fixtures/renommageAnon'
import { lancer, attendreAccueil, fermerAiguillage } from './util'

type Sonde = { perte: boolean; accepte: boolean; publies: string[] }
async function instrumenter(app: ElectronApplication, racine: string, perte = false, ciblePerdue = 'e1.json') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeRenommage: Sonde }
    const original = g.fetch
    g.sondeRenommage = { perte: args.perte, accepte: false, publies: [] }
    g.fetch = async (url, init) => {
      const adresse = url instanceof Request ? url.url : String(url)
      const methode = init?.method ?? (url instanceof Request ? url.method : 'GET')
      const id = adresse.startsWith(`${args.racine}/entretiens/`) || adresse === `${args.racine}/corpus.json` ? adresse.split('/').at(-1)! : ''
      const s = g.sondeRenommage
      if (s.perte && s.accepte && id === args.ciblePerdue && methode === 'GET') throw new Error('Relecture synthétique indisponible')
      const r = await original(url, init)
      if (id && methode === 'PUT' && r.ok) {
        s.publies.push(id)
        if (s.perte && id === args.ciblePerdue) { s.accepte = true; await r.body?.cancel(); throw new Error('Réponse synthétique perdue') }
      }
      return r
    }
  }, { racine, perte, ciblePerdue })
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
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function ouvrirDialogue(page: Page, pseudo = 'Claire') {
  await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /^(Modifier les pseudonymes|Renommer une variante corpus)$/ })).toBeVisible()
  const edition = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
  if (await edition.isVisible()) {
    const champ = edition.getByLabel('Pseudonymes', { exact: true })
    const pseudos = (await champ.inputValue()).split('/').map((p) => p.trim() === pseudo ? 'Nouvelle' : p.trim())
    await champ.fill(pseudos.join(' / '))
    await edition.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  }
  const modal = page.getByRole('dialog', { name: 'Renommer une variante corpus', exact: true })
  await expect(modal).toBeVisible()
  return modal
}
async function banc(port: number) {
  const parent = new ClientWebDAV({ baseUrl: `http://localhost:${port}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/electron-renommage-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  const f = fixtureRenommageAnon(['e1', 'e2', 'e3']); f.sources[2].data.annotations = []
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  await client.putTexte('corpus.json', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
  for (const s of f.sources) await client.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
  const profil = mkdtempSync(join(tmpdir(), 'sonal-electron-renommage-'))
  const tiers = new ClientWebDAV({ baseUrl: `http://localhost:${port}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
  const tenir = async (id: string) => {
    const identite = () => ({ userId: 'olivier', machineId: 'tiers', sessionId: 'e2e-tiers' })
    const provider = port === 8080 ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
    const chemin = port === 8080 ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true)
    return () => provider.liberer(chemin)
  }
  return { client, f, profil, tenir, nettoyer: async () => { await parent.supprimer(dossier); rmSync(profil, { recursive: true, force: true }) } }
}
for (const port of [8080, 8081]) test.describe(`renommage WebDAV :${port}`, () => {
  test.beforeEach(async () => {
    test.setTimeout(360_000)
    const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
    test.skip(!pret, 'Banc Nextcloud absent.')
  })
  test('aperçu serveur, annulation, cible tenue, lot partiel puis nouvel inventaire et consentement', async ({}, info) => {
    const b = await banc(port)
    let app: ElectronApplication | undefined; let rendre: (() => Promise<void>) | undefined
    try {
      app = await lancer(b.profil); await instrumenter(app, b.client.config.baseUrl)
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, true)
      const source = await b.client.getTexteAvecEtag('entretiens/e1.json')
      const data = JSON.parse(source.contenu)
      data.annotations.push({ ...data.annotations[0], id: 'avant-apercu', from: 33, to: 39 })
      await b.client.putTexte('entretiens/e1.json', JSON.stringify(data), { ifMatch: source.etag! })
      let modal = await ouvrirDialogue(page)
      await modal.getByRole('textbox', { name: 'Nouveau pseudonyme' }).fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire', exact: true }).click()
      await expect(modal).toContainText('5 annotation(s) à renommer', { timeout: 90_000 })
      await expect(modal).toContainText('chaque PUT reste conditionnel')
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)).toEqual([])
      rendre = await b.tenir('e2')
      modal = await ouvrirDialogue(page)
      await modal.getByRole('textbox', { name: 'Nouveau pseudonyme' }).fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire', exact: true }).click()
      await expect(modal).toContainText('5 annotation(s) à renommer', { timeout: 90_000 })
      const confirmer = modal.getByRole('button', { name: 'Confirmer le renommage global', exact: true })
      await expect(confirmer).toBeDisabled()
      await page.screenshot({ path: info.outputPath('renommage-webdav-normal.png') })
      await page.setViewportSize({ width: 760, height: 700 })
      await page.screenshot({ path: info.outputPath('renommage-webdav-reduit.png') })
      await modal.getByRole('checkbox').check(); await confirmer.click()
      await expect(modal).toContainText('Lot WebDAV à reprendre', { timeout: 90_000 })
      await expect(modal).toContainText('3 annotation(s) publiée(s) dans 1 entretien(s)')
      await page.screenshot({ path: info.outputPath('renommage-webdav-partiel.png') })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)).toEqual(['corpus.json', 'e1.json'])
      const premier = await b.client.getTexte('entretiens/e1.json')
      await rendre(); rendre = undefined
      const actuel = await b.client.getTexteAvecEtag('entretiens/e2.json')
      await b.client.putTexte('entretiens/e2.json', JSON.stringify({ ...JSON.parse(actuel.contenu), lastModified: '2026-10-10T23:00:00.000Z' }), { ifMatch: actuel.etag! })
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('2 annotation(s) à renommer', { timeout: 90_000 })
      await expect(confirmer).toBeDisabled()
      await modal.getByRole('checkbox').check(); await confirmer.click()
      await expect(modal).not.toBeVisible({ timeout: 90_000 })
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Nouvelle / Rebecca', { timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(premier)
      for (const id of ['e1', 'e2']) {
        const apres = JSON.parse(await b.client.getTexte(`entretiens/${id}.json`))
        expect(apres.locuteurs).toEqual(b.f.sources[0].data.locuteurs)
        expect(apres.definitionsAnonLocales).toEqual(b.f.sources[0].data.definitionsAnonLocales)
        expect(apres.annotations.find((a: { id: string }) => a.id === 'a2').pseudo).toBe('Claire')
        expect(apres.annotations.find((a: { id: string }) => a.id === 'a3').pseudo).toBe('Claire')
      }
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)).toEqual(['corpus.json', 'e1.json', 'e2.json'])
      expect(await page.evaluate(async () => {
        const lecture = await window.sonal.corpus.ouvrirEntretienPourEdition('e3')
        if (!lecture.ok) return false
        lecture.data.corpsTexte = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Édition indépendante après renommage.' }] }] }
        await window.sonal.corpus.ecrireEntretien('e3', lecture.data)
        const publication = await window.sonal.corpus.publierEntretien('e3')
        await window.sonal.corpus.fermerEntretien('e3')
        return publication.ok
      })).toBe(true)
    } finally { await rendre?.(); await app?.close(); await b.nettoyer() }
  })
  test('sauvegarde tardive incertaine : renommage bloqué, image confirmée et autosave ultérieure conservée', async ({}, info) => {
    const b = await banc(port)
    let app: ElectronApplication | undefined
    try {
      app = await lancer(b.profil); await instrumenter(app, b.client.config.baseUrl, true, 'e3.json')
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, true)
      const ann = { ...b.f.sources[0].data.annotations[0], id: 'nouvelle-synthese' }
      expect(await page.evaluate(async (annotation) => {
        const r = await window.sonal.corpus.ouvrirEntretienPourEdition('e3'); if (!r.ok) return false
        r.data.annotations.push(annotation)
        await window.sonal.corpus.ecrireEntretien('e3', r.data)
        try { await window.sonal.corpus.publierEntretien('e3'); return false } catch { return true }
      }, ann)).toBe(true)
      let modal = await ouvrirDialogue(page)
      await modal.getByRole('textbox', { name: 'Nouveau pseudonyme' }).fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('publication d’entretien WebDAV reste indéterminée', { timeout: 90_000 })
      await page.screenshot({ path: info.outputPath('publication-webdav-indeterminee.png') })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)).toEqual(['e3.json'])
      await page.evaluate(async () => {
        const r = await window.sonal.corpus.lireEntretien('e3'); if (!r.ok) throw new Error('Copie locale absente')
        r.data.locuteurs[0].pseudo = 'Révision locale plus récente'
        await window.sonal.corpus.ecrireEntretien('e3', r.data)
      })
      await app.evaluate(() => { (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.perte = false })
      await page.evaluate(() => window.sonal.distant.tirer())
      expect(await page.evaluate(async () => { const r = await window.sonal.corpus.lireEntretien('e3'); return r.ok ? r.data.locuteurs[0].pseudo : '' })).toBe('Révision locale plus récente')
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      modal = await ouvrirDialogue(page)
      await modal.getByRole('textbox', { name: 'Nouveau pseudonyme' }).fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire', exact: true }).click()
      await expect(modal).toContainText('5 annotation(s) à renommer', { timeout: 90_000 })
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer le renommage global', exact: true }).click()
      await expect(modal).toContainText('Lot WebDAV à reprendre', { timeout: 90_000 })
      expect(await page.evaluate(async () => { const r = await window.sonal.corpus.publierEntretien('e3'); await window.sonal.corpus.fermerEntretien('e3'); return r.ok })).toBe(true)
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('1 annotation(s) à renommer', { timeout: 90_000 })
      await expect(modal.getByRole('button', { name: 'Confirmer le renommage global', exact: true })).toBeDisabled()
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer le renommage global', exact: true }).click()
      await expect(modal).not.toBeVisible({ timeout: 90_000 })
      const final = JSON.parse(await b.client.getTexte('entretiens/e3.json'))
      expect(final.annotations.find((a: { id: string }) => a.id === ann.id).pseudo).toBe('Nouvelle')
      expect(final.locuteurs[0].pseudo).toBe('Révision locale plus récente')
      const publies = await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)
      expect(publies).toEqual(['e3.json', 'corpus.json', 'e1.json', 'e2.json', 'e3.json', 'e3.json'])
    } finally { await app?.close(); await b.nettoyer() }
  })
  test('réponse et relecture perdues : suivi IPC, relance refuse les verrous persistants puis reprend sans rejeu', async ({}, info) => {
    const b = await banc(port)
    let app: ElectronApplication | undefined
    try {
      app = await lancer(b.profil); await instrumenter(app, b.client.config.baseUrl, true)
      let page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, true)
      let modal = await ouvrirDialogue(page)
      await modal.getByRole('textbox', { name: 'Nouveau pseudonyme' }).fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire', exact: true }).click()
      await expect(modal).toContainText('4 annotation(s) à renommer', { timeout: 90_000 })
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer le renommage global', exact: true }).click()
      await expect(modal).toContainText('Lot WebDAV à reprendre', { timeout: 90_000 })
      await expect(modal).toContainText('Relire l’original ne prouve pas un refus')
      const premier = await b.client.getTexte('entretiens/e1.json')
      const processus = app.process(); await app.close(); app = undefined
      expect(processus.exitCode !== null || processus.signalCode !== null).toBe(true)
      app = await lancer(b.profil, { preserverSettings: true }); await instrumenter(app, b.client.config.baseUrl)
      page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, false)
      modal = await ouvrirDialogue(page, 'Nouvelle')
      await expect(modal).toContainText('Lot WebDAV à reprendre')
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('Un verrou reste tenu', { timeout: 90_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)).toEqual([])
      await page.screenshot({ path: info.outputPath('renommage-webdav-indetermine.png') })
      // Le processus synthétique d’origine est mort : la libération extérieure ne vient pas de l’application.
      const corpus = await b.client.getTexteAvecEtag('verrous/corpus.lock.json')
      await b.client.supprimer('verrous/corpus.lock.json', corpus.etag!)
      if (port === 8080) await b.client.deverrouiller('entretiens/e1.json')
      else {
        const entretien = await b.client.getTexteAvecEtag('verrous/e1.lock.json')
        await b.client.supprimer('verrous/e1.lock.json', entretien.etag!)
      }
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('2 annotation(s) à renommer', { timeout: 90_000 })
      const confirmer = modal.getByRole('button', { name: 'Confirmer le renommage global', exact: true })
      await expect(confirmer).toBeDisabled()
      await modal.getByRole('checkbox').check(); await confirmer.click()
      await expect(modal).not.toBeVisible({ timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(premier)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRenommage: Sonde }).sondeRenommage.publies)).toEqual(['e2.json'])
    } finally { await app?.close(); await b.nettoyer() }
  })
})
