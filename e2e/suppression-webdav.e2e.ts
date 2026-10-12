/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { ClientWebDAV } from '../src/main/webdav/client'
import { ProviderFilesLock } from '../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../src/main/verrous/providerPutConditionnel'
import { fixtureDissociationAnon as fixtureSuppressionAnon } from '../test/fixtures/dissociationAnon'
import { lancer, attendreAccueil, retourCorpus } from './util'

type Sonde = { perte: 'aucune' | 'finale' | 'kill'; accepte: boolean; publies: string[]; probes: Array<{ methode: string; chemin: string; statut: number; authConforme: boolean }> }
async function instrumenter(app: ElectronApplication, racine: string, perte: Sonde['perte'] = 'aucune', retarderPremiereCible = false) {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeSuppression: Sonde }
    const original = g.fetch
    g.sondeSuppression = { perte: args.perte, accepte: false, publies: [], probes: [] }
    g.fetch = async (url, init) => {
      const adresse = url instanceof Request ? url.url : String(url), methode = init?.method ?? (url instanceof Request ? url.method : 'GET')
      const id = adresse.startsWith(`${args.racine}/entretiens/`) || adresse === `${args.racine}/corpus.json` ? adresse.split('/').at(-1)! : ''
      const s = g.sondeSuppression
      if (s.perte === 'finale' && s.accepte && id === 'corpus.json' && methode === 'GET') throw new Error('Relecture synthétique indisponible')
      const r = await original(url, init)
      if (adresse.startsWith(args.racine)) {
        const auth = new Headers(init?.headers ?? (url instanceof Request ? url.headers : undefined)).get('Authorization')
        s.probes.push({ methode, chemin: adresse.slice(args.racine.length), statut: r.status,
          authConforme: auth === `Basic ${Buffer.from('max:max-max-1234').toString('base64')}` })
      }
      if (id && methode === 'PUT' && r.ok) {
        const retrait = id === 'corpus.json' && !JSON.parse(init!.body as string).suppressionAnon
        s.publies.push(id === 'corpus.json' ? retrait ? 'retrait' : 'barriere' : id)
        // Dépasse le délai du tirage automatique pendant une publication réelle.
        if (args.retarderPremiereCible && id === 'e1.json' && s.publies.filter((p) => p === id).length === 1) await new Promise((r) => setTimeout(r, 65_000))
        if (s.perte === 'finale' && retrait || s.perte === 'kill' && id === 'e1.json') {
          s.accepte = true; await r.body?.cancel()
          if (s.perte === 'kill') await new Promise(() => {})
          throw new Error('Réponse synthétique perdue')
        }
      }
      return r
    }
  }, { racine, perte, retarderPremiereCible })
}
async function connecter(page: Page, url: string, nouveau = true, app?: ElectronApplication) {
  await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
  if (nouveau) {
    await page.locator('.modale-distant input.champ').nth(0).fill(url)
    await page.locator('.modale-distant input.champ').nth(1).fill('max')
    await page.locator('.modale-distant input[type=password]').fill('max-max-1234')
    await page.locator('.modale-distant .valider').click()
  }
  try { await expect(page.locator('.modale-distant .comptes')).toBeVisible({ timeout: 30_000 }) }
  catch (e) {
    const probes = app ? await app.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.probes) : []
    throw new Error(`Connexion du banc refusée : ${JSON.stringify(probes)} ; ${String(e)}`)
  }
  const secrets = page.locator('.modale-distant .secret-compte')
  for (let i = 0; i < await secrets.count(); i++) await secrets.nth(i).fill('max-max-1234')
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  await expect(page.locator('.corpus-ecran')).toBeVisible({ timeout: 90_000 })
  await page.locator('.onglets-corpus').getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function dialogue(page: Page) {
  await page.getByRole('button', { name: 'Supprimer partout Karine', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Supprimer une règle partout', exact: true })
  await expect(modal).toBeVisible(); return modal
}
async function preparer(page: Page) {
  const modal = await dialogue(page)
  await modal.getByRole('button', { name: 'Préparer la suppression globale', exact: true }).click()
  await expect(modal).toContainText('8 passage(s) concerné(s)', { timeout: 90_000 }); return modal
}
async function banc(port: number) {
  const base = `http://localhost:${port}`
  const parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/electron-suppression-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  const f = fixtureSuppressionAnon()
  f.corpus.nom = 'Suppression synthétique'
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  await client.putTexte('corpus.json', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
  for (const s of f.sources) await client.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
  const profil = mkdtempSync(join(tmpdir(), 'sonal-electron-suppression-'))
  const lancement = () => lancer(profil)
  const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
  const tenir = async (id: string) => {
    const identite = () => ({ userId: 'olivier', machineId: 'tiers', sessionId: 'qualification-tiers' })
    const provider = port === 8080 ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
    const chemin = port === 8080 ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true); return () => provider.liberer(chemin)
  }
  const relance = () => lancer(profil, { preserverSettings: true })
  return { base, client, tiers, f, profil, lancement, relance, tenir,
    nettoyer: async () => { await parent.supprimer(dossier); rmSync(profil, { recursive: true, force: true }) } }
}
for (const port of [8080, 8081]) test.describe(`suppression WebDAV :${port}`, () => {
  test.beforeEach(async () => {
    test.setTimeout(360_000)
    const pret = await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false)
    test.skip(!pret, 'Banc Nextcloud absent.')
  })
  test('annulation, mémoire entière, cible tenue puis nouveaux usages sous consentement renouvelé', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined, rendre: (() => Promise<void>) | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'aucune', port === 8081)
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, true, app)
      let modal = await preparer(page)
      await expect(modal).toContainText('Sur WebDAV, les entretiens sont mis à jour l’un après l’autre')
      await page.screenshot({ path: info.outputPath('suppression-webdav-normale.png') })
      await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('suppression-webdav-reduite.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.publies)).toEqual([])
      rendre = await b.tenir('e2'); modal = await preparer(page)
      await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
      await expect(modal).toContainText('4 choix retiré(s)', { timeout: 120_000 })
      await expect(modal).toContainText('Lot WebDAV de suppression à reprendre')
      await page.screenshot({ path: info.outputPath('suppression-webdav-partielle.png') })
      const acquis = await b.client.getTexte('entretiens/e1.json')
      await rendre(); rendre = undefined
      const e3 = await b.tiers.getTexteAvecEtag('entretiens/e3.json')
      await b.tiers.putTexte('entretiens/e3.json', JSON.stringify(b.f.sources[0].data, null, 2), { ifMatch: e3.etag! })
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('8 passage(s) concerné(s)', { timeout: 90_000 })
      await expect(modal.getByRole('checkbox')).not.toBeChecked()
      await expect(modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true })).toBeDisabled()
      await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
      try { await expect(modal).toBeHidden({ timeout: 90_000 }) }
      catch (e) {
        const bilan = await page.evaluate(() => window.sonal.corpus.suiviSuppressionAnon())
        const sonde = await app.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression)
        throw new Error(`Reprise du banc incomplète : ${JSON.stringify({ bilan, sonde })} ; ${String(e)}`)
      }
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(acquis)
      const e1 = JSON.parse(acquis)
      expect(e1.definitionsAnonLocales).toEqual(b.f.sources[0].data.definitionsAnonLocales)
      const attendu = structuredClone(b.f.sources[0].data); attendu.annotations = attendu.annotations.filter((a) => a.regle !== 'personne'); attendu.lastModified = e1.lastModified
      expect(e1).toEqual(attendu)
      expect(e1.locuteurs).toEqual(b.f.sources[0].data.locuteurs)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.publies)).toEqual(['barriere', 'e1.json', 'e2.json', 'e3.json', 'retrait'])
    } finally { if (rendre) await rendre(); if (app) await app.close(); await b.nettoyer() }
  })
  test('édition sauvegardée puis annulation, texte et mémoire conservés après suppression exacte', async () => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl)
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil', exact: true }).click()
      await page.locator('.carte-ent .crayon').first().click()
      await expect(page.locator('.editeur')).toContainText('Rue Karine. Local.', { timeout: 30_000 })
      await page.locator('.editeur').press('Control+End'); await page.locator('.editeur').press('End')
      await page.keyboard.insertText(' Note indépendante conservée.')
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 15_000 })
      await retourCorpus(page)
      await page.locator('.onglets-corpus').getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      const modal = await preparer(page), publie = await b.client.getTexte('entretiens/e1.json')
      expect(publie).toContain('Note indépendante conservée.')
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(publie)
      const consentement = await preparer(page)
      await consentement.getByRole('checkbox').check(); await consentement.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
      await expect(consentement).toBeHidden({ timeout: 90_000 })
      const actuel = JSON.parse(await b.client.getTexte('entretiens/e1.json')), attendu = JSON.parse(publie)
      attendu.annotations = attendu.annotations.filter((a: { regle?: string }) => a.regle !== 'personne'); attendu.lastModified = actuel.lastModified
      expect(actuel).toEqual(attendu)
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
  test('retrait accepté et réponse perdue : suivi indéterminé puis succès sans rejeu', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'finale')
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      const modal = await preparer(page); await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
      await expect(modal).toContainText('Le serveur n’a pas confirmé le résultat', { timeout: 90_000 })
      await expect(modal.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('suppression-webdav-indeterminee.png') })
      expect(JSON.parse(await b.client.getTexte('corpus.json')).reglesAnon.personne).toBeUndefined()
      await app.evaluate(() => { (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.perte = 'aucune' })
      await modal.getByRole('button', { name: 'Relire le suivi WebDAV', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 90_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.publies)).toEqual(['barriere', 'e1.json', 'e2.json', 'retrait'])
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
  test('SIGKILL après premier retrait : bail persistant refusé, preuve extérieure puis seule cible restante', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'kill')
      let page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      let modal = await preparer(page); await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
      await expect.poll(() => app!.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.accepte), { timeout: 90_000 }).toBe(true)
      const acquis = await b.client.getTexte('entretiens/e1.json'), bail = await b.client.getTexteAvecEtag('verrous/corpus.lock.json')
      const bailEntretien = port === 8080 ? await b.client.etatVerrouNatif('entretiens/e1.json') : await b.client.getTexteAvecEtag('verrous/e1.lock.json')
      expect(JSON.parse(bail.contenu).sessionId).toMatch(/^suppression-anon-/)
      const processus = app.process(), sortie = new Promise<NodeJS.Signals | null>((resolve) => processus.once('exit', (_code, signal) => resolve(signal)))
      processus.kill('SIGKILL'); expect(await sortie).toBe('SIGKILL'); app = undefined
      app = await b.relance(); await instrumenter(app, b.client.config.baseUrl)
      page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, false)
      const suivi = page.locator('section[role=status]', { hasText: 'Lot WebDAV de suppression à reprendre' }).first()
      await expect(suivi).toBeVisible({ timeout: 30_000 })
      await suivi.getByRole('button', { name: 'Relire le suivi WebDAV', exact: true }).click()
      await expect(suivi).toContainText('Impossible de vérifier l’avancement', { timeout: 30_000 })
      await expect(suivi.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('suppression-webdav-bail-persistant.png') })
      expect(await b.client.getTexteAvecEtag('verrous/corpus.lock.json')).toEqual(bail)
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(acquis)
      const utilisateur = await fetch(`${b.base}/ocs/v2.php/cloud/user?format=json`, { headers: {
        'OCS-APIRequest': 'true', Authorization: `Basic ${Buffer.from('max:max-max-1234').toString('base64')}`,
      } }).then((r) => r.json())
      expect(utilisateur.ocs.data.id).toBe('max'); expect(JSON.parse(bail.contenu).userId).toBe('max')
      // Seul le banc libère ici des droits dont le processus détenteur est mort.
      await b.client.supprimer('verrous/corpus.lock.json', bail.etag!)
      if (port === 8080) {
        const actuel = await b.client.etatVerrouNatif('entretiens/e1.json')
        expect(actuel).toEqual(bailEntretien); expect(actuel?.owner).toBe('max')
        await b.client.deverrouiller('entretiens/e1.json')
      } else {
        const cible = await b.client.getTexteAvecEtag('verrous/e1.lock.json')
        expect(cible).toEqual(bailEntretien)
        expect(JSON.parse(cible.contenu).userId).toBe('max')
        expect(JSON.parse(cible.contenu).machineId).toBe(JSON.parse(bail.contenu).machineId)
        expect(JSON.parse(cible.contenu).sessionId).toMatch(/^suppression-anon-/)
        await b.client.supprimer('verrous/e1.lock.json', cible.etag!)
      }
      await suivi.getByRole('button', { name: 'Relire le suivi WebDAV', exact: true }).click()
      await expect(suivi.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeEnabled({ timeout: 90_000 })
      await suivi.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      modal = page.getByRole('dialog', { name: 'Supprimer une règle partout', exact: true })
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('4 passage(s) concerné(s)', { timeout: 90_000 })
      await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale', exact: true }).click()
      await expect(modal).toBeHidden({ timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(acquis)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: Sonde }).sondeSuppression.publies)).toEqual(['e2.json', 'retrait'])
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
})
