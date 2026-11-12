/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { ClientWebDAV } from '../src/main/webdav/client'
import { ProviderFilesLock } from '../src/main/verrous/providerFilesLock'
import { ProviderPutConditionnel } from '../src/main/verrous/providerPutConditionnel'
import { fixtureRetraitVarianteAnon } from '../test/fixtures/retraitVarianteAnon'
import { lancer, attendreAccueil, fermerAiguillage, retourCorpus } from './util'

type Sonde = { perte: 'aucune' | 'finale' | 'kill'; accepte: boolean; publies: string[] }
async function instrumenter(app: ElectronApplication, racine: string, perte: Sonde['perte'] = 'aucune') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeRetrait: Sonde }, original = globalThis.fetch
    g.sondeRetrait = { perte: args.perte, accepte: false, publies: [] }
    g.fetch = async (url, init) => {
      const adresse = url instanceof Request ? url.url : String(url), methode = init?.method ?? (url instanceof Request ? url.method : 'GET')
      const id = adresse.startsWith(`${args.racine}/entretiens/`) || adresse === `${args.racine}/corpus.crp` ? adresse.split('/').at(-1)! : ''
      const s = g.sondeRetrait
      if (s.perte === 'finale' && s.accepte && id === 'corpus.crp' && methode === 'GET') throw new Error('Relecture synthétique indisponible')
      const r = await original(url, init)
      if (id && methode === 'PUT' && r.ok) {
        const retrait = id === 'corpus.crp' && !JSON.parse(init!.body as string).retraitVarianteAnon
        s.publies.push(id === 'corpus.crp' ? retrait ? 'retrait' : 'barriere' : id)
        if (s.perte === 'finale' && retrait || s.perte === 'kill' && id === 'e1.json') {
          s.accepte = true; await r.body?.cancel()
          if (s.perte === 'kill') await new Promise(() => {})
          throw new Error('Réponse synthétique perdue')
        }
      }
      return r
    }
  }, { racine, perte })
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
  for (let i = 0; i < await secrets.count(); i++) await secrets.nth(i).fill('max-max-1234')
  await page.locator('.modale-distant .mini.ouvrir').first().click()
  // Première ouverture de ce corpus sur le poste : l'aiguillage mène aux entretiens.
  await fermerAiguillage(page, 'entretiens', 120_000)
  await expect(page.locator('.corpus-ecran')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function dialogue(page: Page) {
  await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
  const edition = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
  if (await edition.isVisible()) {
    await edition.getByLabel('Pseudonymes', { exact: true }).fill('Rebecca')
    await edition.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  }
  const modal = page.getByRole('dialog', { name: 'Retirer une variante', exact: true }); await expect(modal).toBeVisible(); return modal
}
async function preparer(page: Page) {
  const modal = await dialogue(page)
  await modal.getByRole('button', { name: 'Préparer le retrait de variante', exact: true }).click()
  await expect(modal).toContainText('6 choix à remplacer dans 2 entretien(s)', { timeout: 90_000 }); return modal
}
async function confirmer(modal: ReturnType<Page['getByRole']>) {
  await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Remplacer les choix et retirer la variante', exact: true }).click()
}
async function banc(port: number) {
  const base = `http://localhost:${port}`, parent = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/max/MonCorpus`, identifiants: { utilisateur: 'max', motDePasse: 'max-max-1234' } })
  const dossier = `sonde/electron-retrait-variante-${randomUUID()}`
  await parent.creerDossier('sonde'); await parent.creerDossier(dossier)
  const client = new ClientWebDAV({ ...parent.config, baseUrl: `${parent.config.baseUrl}/${dossier}` })
  await client.creerDossier('entretiens'); await client.creerDossier('verrous')
  const f = fixtureRetraitVarianteAnon(); f.corpus.nom = 'Retrait synthétique'
  await client.putTexte('corpus.crp', JSON.stringify(f.corpus, null, 2), { ifNoneMatch: '*' })
  for (const s of f.sources) await client.putTexte(`entretiens/${s.id}.json`, JSON.stringify(s.data, null, 2), { ifNoneMatch: '*' })
  const profil = mkdtempSync(join(tmpdir(), 'sonal-electron-retrait-webdav-'))
  const tiers = new ClientWebDAV({ baseUrl: `${base}/remote.php/dav/files/olivier/MonCorpus/${dossier}`, identifiants: { utilisateur: 'olivier', motDePasse: 'olivier-olivier-5678' } })
  const tenir = async (id: string) => {
    const identite = () => ({ userId: 'olivier', machineId: 'tiers', sessionId: 'qualification-tiers' })
    const provider = port === 8080 ? new ProviderFilesLock(tiers, identite) : new ProviderPutConditionnel(tiers, identite)
    const chemin = port === 8080 ? `entretiens/${id}.json` : `verrous/${id}.lock.json`
    expect((await provider.acquerir(chemin)).ok).toBe(true); return () => provider.liberer(chemin)
  }
  const lancement = (preserverSettings = false) => lancer(profil, { preserverSettings, repertoireApplication: process.env.SONAL_E2E_APPLICATION })
  return { base, f, client, tiers, profil, lancement, tenir, nettoyer: async () => { await parent.supprimer(dossier); rmSync(profil, { recursive: true, force: true }) } }
}
for (const port of [8080, 8081]) test.describe(`Retrait variante WebDAV :${port}`, () => {
  test.beforeEach(async () => { test.setTimeout(300_000); test.skip(!await fetch(`http://localhost:${port}/status.php`, { signal: AbortSignal.timeout(800) }).then((r) => r.ok).catch(() => false), 'Banc Nextcloud absent.') })
  test('slash, annulation, cible tenue puis nouveaux choix examinés avec accord neuf', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined, rendre: (() => Promise<void>) | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl)
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      let modal = await preparer(page)
      await expect(modal).toContainText('3 exception(s) et 2 choix masqué(s)')
      await page.screenshot({ path: info.outputPath('retrait-webdav-normal.png') })
      await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('retrait-webdav-reduit.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.publies)).toEqual([])
      rendre = await b.tenir('e2'); modal = await preparer(page); await confirmer(modal)
      await expect(modal).toContainText('3 choix remplacé(s)', { timeout: 90_000 })
      await page.screenshot({ path: info.outputPath('retrait-webdav-partiel.png') })
      const acquis = await b.client.getTexte('entretiens/e1.json'), nonCible = await b.tiers.getTexteAvecEtag('entretiens/e3.json'), nouveau = JSON.parse(nonCible.contenu)
      nouveau.annotations[0].pseudo = 'Claire'; await b.tiers.putTexte('entretiens/e3.json', JSON.stringify(nouveau), { ifMatch: nonCible.etag! })
      await rendre(); rendre = undefined
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('4 choix à remplacer', { timeout: 90_000 })
      await expect(modal.getByRole('checkbox')).not.toBeChecked()
      await expect(modal.getByRole('button', { name: 'Remplacer les choix et retirer la variante', exact: true })).toBeDisabled()
      await confirmer(modal); await expect(modal).toBeHidden({ timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(acquis)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.publies)).toEqual(['barriere', 'e1.json', 'e2.json', 'e3.json', 'retrait'])
      const attendu = structuredClone(b.f.sources[0].data), actuel = JSON.parse(acquis)
      for (const a of attendu.annotations) if (a.regle === 'personne' && a.pseudo?.trim().toLowerCase() === 'claire') a.pseudo = 'Rebecca'
      attendu.lastModified = actuel.lastModified; expect(actuel).toEqual(attendu)
    } finally { if (rendre) await rendre(); if (app) await app.close(); await b.nettoyer() }
  })
  test('édition normale sauvegardée, définition périmée refusée puis seuls choix liés remplacés', async () => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl)
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens', exact: true }).click()
      await page.locator('.carte-ent .crayon').first().click()
      await expect(page.locator('.editeur')).toContainText('Karine', { timeout: 30_000 })
      await page.locator('.editeur').press('Control+End'); await page.keyboard.insertText(' Modification indépendante conservée.')
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 15_000 }); await retourCorpus(page)
      await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      let modal = await preparer(page), source = await b.client.getTexte('entretiens/e1.json')
      expect(source).toContain('Modification indépendante conservée.')
      const c = await b.tiers.getTexteAvecEtag('corpus.crp'), corpus = JSON.parse(c.contenu); corpus.reglesAnon.personne.categorie = 'Autre'
      await b.tiers.putTexte('corpus.crp', JSON.stringify(corpus), { ifMatch: c.etag! })
      await confirmer(modal); await expect(modal).toContainText('Le retrait n’a pas pu être terminé', { timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(source)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      const actualiserCorpus = page.locator('button.btn-table').filter({ hasText: '⟳ Actualiser' })
      await actualiserCorpus.click()
      await expect(actualiserCorpus).toBeEnabled({ timeout: 90_000 })
      await page.locator('.onglets-corpus').getByRole('button', { name: 'Entretiens', exact: true }).click()
      await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      modal = await preparer(page); await confirmer(modal); await expect(modal).toBeHidden({ timeout: 90_000 })
      const actuel = JSON.parse(await b.client.getTexte('entretiens/e1.json')), attendu = JSON.parse(source)
      for (const a of attendu.annotations) if (a.regle === 'personne' && a.pseudo?.trim().toLowerCase() === 'claire') a.pseudo = 'Rebecca'
      attendu.lastModified = actuel.lastModified; expect(actuel).toEqual(attendu)
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
  test('retrait final accepté, réponse perdue puis relecture sans répétition', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'finale')
      const page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      const modal = await preparer(page); await confirmer(modal)
      await expect(modal).toContainText('Le serveur n’a pas confirmé le résultat', { timeout: 90_000 })
      await expect(modal.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('retrait-webdav-indetermine.png') })
      expect(JSON.parse(await b.client.getTexte('corpus.crp')).reglesAnon.personne.pseudos).toEqual(['Rebecca'])
      await app.evaluate(() => { (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.perte = 'aucune' })
      await modal.getByRole('button', { name: 'Relire le suivi WebDAV', exact: true }).click(); await expect(modal).toBeHidden({ timeout: 90_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.publies)).toEqual(['barriere', 'e1.json', 'e2.json', 'retrait'])
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
  test('SIGKILL après acceptation : reconnaissance, droits persistants refusés puis seule cible restante', async ({}, info) => {
    const b = await banc(port); let app: ElectronApplication | undefined
    try {
      app = await b.lancement(); await instrumenter(app, b.client.config.baseUrl, 'kill')
      let page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl)
      let modal = await preparer(page); await confirmer(modal)
      await expect.poll(() => app!.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.accepte), { timeout: 90_000 }).toBe(true)
      const acquis = await b.client.getTexte('entretiens/e1.json'), bail = await b.client.getTexteAvecEtag('verrous/corpus.lock.json')
      const cible = port === 8080 ? await b.client.etatVerrouNatif('entretiens/e1.json') : await b.client.getTexteAvecEtag('verrous/e1.lock.json')
      expect(JSON.parse(bail.contenu).sessionId).toMatch(/^retrait-variante-/)
      const processus = app.process(), sortie = new Promise<NodeJS.Signals | null>((resolve) => processus.once('exit', (_code, signal) => resolve(signal)))
      processus.kill('SIGKILL'); expect(await sortie).toBe('SIGKILL'); app = undefined
      app = await b.lancement(true); await instrumenter(app, b.client.config.baseUrl)
      page = await app.firstWindow(); await connecter(page, b.client.config.baseUrl, false)
      modal = await dialogue(page)
      await modal.getByRole('button', { name: 'Relire le suivi WebDAV', exact: true }).click(); await expect(modal).toContainText('3 choix remplacé(s)', { timeout: 90_000 })
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click(); await expect(modal).toContainText('3 choix à remplacer', { timeout: 90_000 })
      await confirmer(modal); await expect(modal).toContainText('3 choix remplacé(s)', { timeout: 90_000 })
      expect(await b.client.getTexteAvecEtag('verrous/corpus.lock.json')).toEqual(bail)
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(acquis)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.publies)).toEqual([])
      await page.screenshot({ path: info.outputPath('retrait-webdav-droit-persistant.png') })
      const utilisateur = await fetch(`${b.base}/ocs/v2.php/cloud/user?format=json`, { headers: { 'OCS-APIRequest': 'true', Authorization: `Basic ${Buffer.from('max:max-max-1234').toString('base64')}` } }).then((r) => r.json())
      expect(utilisateur.ocs.data.id).toBe('max'); expect(JSON.parse(bail.contenu).userId).toBe('max')
      // Intervention du banc après mort prouvée, compte et génération vérifiés ; jamais un droit du produit.
      await b.client.supprimer('verrous/corpus.lock.json', bail.etag!)
      if (port === 8080) { const actuel = await b.client.etatVerrouNatif('entretiens/e1.json'); expect(actuel).toEqual(cible); expect(actuel?.owner).toBe('max'); await b.client.deverrouiller('entretiens/e1.json') }
      else { const actuel = await b.client.getTexteAvecEtag('verrous/e1.lock.json'); expect(actuel).toEqual(cible); expect(JSON.parse(actuel.contenu).userId).toBe('max'); expect(JSON.parse(actuel.contenu).sessionId).toMatch(/^retrait-variante-/); await b.client.supprimer('verrous/e1.lock.json', actuel.etag!) }
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click(); await expect(modal).toContainText('3 choix à remplacer', { timeout: 90_000 })
      await expect(modal.getByRole('checkbox')).not.toBeChecked(); await confirmer(modal); await expect(modal).toBeHidden({ timeout: 90_000 })
      expect(await b.client.getTexte('entretiens/e1.json')).toBe(acquis)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.publies)).toEqual(['e2.json', 'retrait'])
    } finally { if (app) await app.close(); await b.nettoyer() }
  })
})
