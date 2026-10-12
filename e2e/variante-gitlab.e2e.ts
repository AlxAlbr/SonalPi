import { expect, test, type Page, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { attendreAccueil, attendreCorpus, lancer } from './util'
import { intercepterOuvertureUrl, pathAvecShim, attendreUrlAutorisation, consentir, sessionQualification, type InterceptionOuvertureUrl, type SessionQualification } from './qualification/connexionOAuth'
import { fixtureRenommageAnon } from '../test/fixtures/renommageAnon'
import { ClientGitLab } from '../src/main/gitlab/client'
import { BailGitLab, DepotCommitsGitLabClient, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../src/main/gitlab/bailGitLab'

const config = { url: process.env.GITLAB_URL?.replace(/\/$/, ''), token: process.env.GITLAB_USER1_TOKEN, token2: process.env.GITLAB_USER2_TOKEN,
  clientId: process.env.GITLAB_OAUTH_CLIENT_ID, utilisateur: process.env.GITLAB_OAUTH_USER1 ?? 'user1', motDePasse: process.env.GITLAB_OAUTH_PASSWORD1, ca: process.env.GITLAB_CA }
const presente = Boolean(config.url && config.token && config.token2 && config.clientId && config.motDePasse)
async function api<T>(chemin: string, init: RequestInit = {}, token = config.token!): Promise<T> {
  const headers = new Headers(init.headers); headers.set('PRIVATE-TOKEN', token)
  if (init.body) headers.set('Content-Type', 'application/json')
  const r = await fetch(`${config.url}/api/v4${chemin}`, { ...init, headers, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) { await r.body?.cancel(); throw new Error(`Fixture GitLab refusée : HTTP ${r.status}`) }
  return await r.json() as T
}
function lancerProfil(profil: string, shim: InterceptionOuvertureUrl, preserverSettings = false) {
  return lancer(profil, { preserverSettings, env: { PATH: pathAvecShim(shim.repertoire), SONAL_URL_OUVRTE: shim.fichierUrl } })
}
async function authentifier(page: Page, shim: InterceptionOuvertureUrl, session: SessionQualification, bouton: RegExp) {
  await page.getByRole('button', { name: bouton }).click()
  const url = await attendreUrlAutorisation(shim), navigateur = await session.newPage()
  try { await navigateur.goto(url); await consentir(navigateur, { utilisateur: config.utilisateur, motDePasse: config.motDePasse! }) }
  finally { await navigateur.close() }
}
async function ouvrir(page: Page, shim: InterceptionOuvertureUrl, session: SessionQualification, projet: { id: number; path_with_namespace: string }) {
  await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
  const onglet = page.getByRole('tab', { name: 'GitLab' }); await onglet.evaluate((e: HTMLButtonElement) => e.click())
  await page.locator('.url-projet-gitlab').fill(`${config.url}/${projet.path_with_namespace}`)
  await page.locator('.client-id-gitlab').fill(config.clientId!)
  await authentifier(page, shim, session, /^Ouvrir le corpus$/); await attendreCorpus(page)
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function rouvrir(page: Page, shim: InterceptionOuvertureUrl, session: SessionQualification) {
  await attendreAccueil(page); await page.locator('.recent').first().click()
  await expect(page.locator('.modale-distant')).toBeVisible()
  await authentifier(page, shim, session, /^Se reconnecter et ouvrir$/); await attendreCorpus(page)
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function editer(page: Page, entite = 'Karine', texte = 'Claire / Rebecca') {
  await page.getByRole('button', { name: `Modifier les pseudonymes de ${entite}`, exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
  await modal.getByLabel('Pseudonymes', { exact: true }).fill(texte)
  return modal
}
type Sonde = { mode: 'normal' | 'perte' | 'kill'; accepte: boolean; envois: number }
async function instrumenter(app: ElectronApplication, projet: number, mode: Sonde['mode'] = 'normal') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeVariante: Sonde }, original = g.fetch
    g.sondeVariante = { mode: args.mode, accepte: false, envois: 0 }
    g.fetch = async (url, init) => {
      const adresse = new URL(url instanceof Request ? url.url : String(url)), s = g.sondeVariante
      if (s.mode === 'perte' && s.accepte && adresse.searchParams.has('search')) throw new Error('Historique synthétique indisponible')
      const ajout = adresse.pathname === `/api/v4/projects/${args.projet}/repository/commits` && init?.method === 'POST' && String(init.body).includes('Sonal ajout-variante-')
      const r = await original(url, init)
      if (ajout && r.ok) {
        s.envois++; s.accepte = true
        if (s.mode === 'kill') { await r.body?.cancel(); await new Promise(() => {}) }
        if (s.mode === 'perte') { await r.body?.cancel(); throw new Error('Réponse synthétique perdue') }
      }
      return r
    }
  }, { projet, mode })
}
async function banc(suffixe: string) {
  const id = randomUUID(), projet = await api<{ id: number; path_with_namespace: string }>('/projects', { method: 'POST', body: JSON.stringify({ name: `Sonal variantes ${suffixe} ${id}`, path: `sonal-variantes-${id}`, initialize_with_readme: true, default_branch: 'main', visibility: 'private' }) })
  const f = fixtureRenommageAnon(); f.corpus.nom = 'Variantes synthétiques'; f.corpus.reglesAnon.personne.pseudos = ['Claire']
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur', mExport: 1 }] }
  await api(`/projects/${projet.id}/repository/commits`, { method: 'POST', body: JSON.stringify({ branch: 'main', commit_message: 'fixture : variantes synthétiques', actions: [
    { action: 'create', file_path: 'corpus.json', content: JSON.stringify(f.corpus) }, ...f.sources.map((s) => ({ action: 'create', file_path: `entretiens/${s.id}.json`, content: JSON.stringify(s.data) })),
  ] }) })
  const second = await api<{ id: number }>('/user', {}, config.token2!)
  await api(`/projects/${projet.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: second.id, access_level: 40 }) })
  await expect.poll(async () => { try { return (await api<{ can_push: boolean }>(`/projects/${projet.id}/repository/branches/main`, {}, config.token2!)).can_push } catch { return false } }, { timeout: 90_000, intervals: [500, 1_000, 2_000, 5_000] }).toBe(true)
  const depot = new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: config.url!, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: config.token! } }))
  const bob = new BailGitLab({ branche: 'main', depot: new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: config.url!, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: config.token2! } })), identite: () => ({ userId: String(second.id), machineId: 'fixture-bob', sessionId: suffixe }) })
  const lire = () => depot.lireFichier('corpus.json', 'main')
  const sources = () => Promise.all(f.sources.map((s) => depot.lireFichier(`entretiens/${s.id}.json`, 'main')))
  return { f, projet, depot, bob, lire, sources }
}

test.describe('Ajout de variante GitLab — parcours normal', () => {
  test.skip(!presente, 'variables GitLab OAuth/deux comptes absentes')
  test.setTimeout(180_000)
  test('variante GitLab : slash, annulation, corpus tenu puis ajout avec entretien tenu inchangé', async ({ browser }, info) => {
    const b = await banc('nominal'), profil = mkdtempSync(join(tmpdir(), 'sonal-variante-oauth-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const app = await lancerProfil(profil, shim)
    const entree = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e1.json')); if (!entree.ok) throw new Error('Fixture entretien')
    try {
      await instrumenter(app, b.projet.id); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const avant = await b.sources(), chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'entretiens/e1.json')), bail = await b.depot.lireFichier(chemin, 'main')
      let modal = await editer(page); await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(JSON.parse((await b.lire())!.contenu).reglesAnon.personne.pseudos).toEqual(['Claire'])
      const tenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'corpus.json')); if (!tenu.ok) throw new Error('Fixture corpus')
      modal = await editer(page); await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
      await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé'); await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
      await b.bob.liberer(tenu.droit)
      modal = await editer(page); await page.screenshot({ path: info.outputPath('variante-gitlab-normale.png') })
      await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('variante-gitlab-reduite.png') })
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal).toBeHidden()
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
      const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos.push('Rebecca')
      expect(JSON.parse((await b.lire())!.contenu)).toEqual(attendu); expect(await b.sources()).toEqual(avant); expect(await b.depot.lireFichier(chemin, 'main')).toEqual(bail)
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.envois)).toBe(1)
    } finally { await b.bob.liberer(entree.droit); await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('variante GitLab : définition publiée changée, refus puis nouvelle saisie après actualisation', async ({ browser }) => {
    const b = await banc('perime'), profil = mkdtempSync(join(tmpdir(), 'sonal-variante-perime-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenter(app, b.projet.id); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      let modal = await editer(page), source = await b.lire(); const concurrent = JSON.parse(source!.contenu); concurrent.reglesAnon.personne.categorie = 'Autre'
      await b.depot.publierCommit('main', 'fixture : définition changée', [{ action: 'update', file_path: 'corpus.json', last_commit_id: source!.commitId, content: JSON.stringify(concurrent) }])
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé')
      await modal.getByRole('button', { name: 'Fermer', exact: true }).click(); await page.locator('.synchro-zone button').click()
      await expect(page.locator('.synchro-zone button')).toBeEnabled()
      await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Karine' }).getByText('Autre', { exact: true })).toBeVisible()
      modal = await editer(page); await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal).toBeHidden()
      source = await b.lire(); expect(JSON.parse(source!.contenu).reglesAnon.personne).toMatchObject({ pseudos: ['Claire', 'Rebecca'], categorie: 'Autre' })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.envois)).toBe(1)
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('variante GitLab : réponse perdue, nouvel envoi bloqué, actualisation reconnaît sans répétition', async ({ browser }) => {
    const b = await banc('perte'), profil = mkdtempSync(join(tmpdir(), 'sonal-variante-perte-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenter(app, b.projet.id, 'perte'); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const avant = await b.sources(), modal = await editer(page)
      await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(modal.getByRole('alert')).toContainText('n’a pas pu être confirmé')
      await expect(modal.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled(); await modal.getByRole('button', { name: 'Fermer', exact: true }).click()
      await app.evaluate(() => { (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.mode = 'normal' })
      await page.locator('.synchro-zone button').click()
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.envois)).toBe(1)
      expect(await b.sources()).toEqual(avant)
      expect(await b.depot.lireFichier(cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'corpus.json')), 'main')).toBeNull()
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('variante GitLab : SIGKILL après ajout accepté, relance reconnaît sans libérer le bail ; autre ajout refusé', async ({ browser }, info) => {
    const b = await banc('kill'), profil = mkdtempSync(join(tmpdir(), 'sonal-variante-kill-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    let app = await lancerProfil(profil, shim), mort = false
    try {
      await instrumenter(app, b.projet.id, 'kill'); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const avant = await b.sources(), modal = await editer(page); await modal.getByRole('button', { name: 'Enregistrer', exact: true }).click()
      await expect.poll(() => app.evaluate(() => (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.accepte)).toBe(true)
      const chemin = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'corpus.json')), bail = await b.depot.lireFichier(chemin, 'main')
      const processus = app.process(), sortie = new Promise<void>((resolve) => processus.once('exit', () => resolve()))
      expect(processus.kill('SIGKILL')).toBe(true); await sortie; mort = true; expect(processus.signalCode).toBe('SIGKILL')
      app = await lancerProfil(profil, shim, true); await instrumenter(app, b.projet.id)
      const reprise = await app.firstWindow(); await rouvrir(reprise, shim, session)
      await expect(reprise.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Claire / Rebecca')
      expect(await b.depot.lireFichier(chemin, 'main')).toEqual(bail)
      const autre = await editer(reprise, 'Ailleurs', 'Nouvelle / Autre choix')
      await autre.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(autre.getByRole('alert')).toContainText('n’a pas pu être confirmé')
      await reprise.screenshot({ path: info.outputPath('variante-gitlab-bail-persistant.png') })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.envois)).toBe(0)
      expect(await b.depot.lireFichier(chemin, 'main')).toEqual(bail); expect(await b.sources()).toEqual(avant)
      expect(mort).toBe(true)
      const compte = await api<{ id: number; username: string }>('/user'), detenteur = JSON.parse(bail!.contenu)
      expect([String(compte.id), compte.username]).toContain(detenteur.holder.userId)
      const courant = await b.depot.lireFichier(chemin, 'main'); expect(courant).toEqual(bail)
      const externe = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: detenteur.holder.userId, machineId: 'fixture', sessionId: 'mort-prouvee' }) })
      expect(await externe.rendreBailNotre(chemin, detenteur.generation)).toBe('libere')
      await autre.getByRole('button', { name: 'Fermer', exact: true }).click()
      const nouveau = await editer(reprise, 'Ailleurs', 'Nouvelle / Autre choix'); await nouveau.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await expect(nouveau).toBeHidden()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeVariante: Sonde }).sondeVariante.envois)).toBe(1)
      expect(JSON.parse((await b.lire())!.contenu).reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
      expect(await b.sources()).toEqual(avant)
    } finally { await app.close().catch(() => undefined); await session.fermer(); shim.nettoyer(); if (mort) rmSync(profil, { recursive: true, force: true }) }
  })
})
