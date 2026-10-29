import { expect, test, type Page, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { lancer, attendreAccueil, attendreCorpus, fermerAiguillage, retourCorpus } from './util'
import { intercepterOuvertureUrl, pathAvecShim, attendreUrlAutorisation, consentir, sessionQualification, type InterceptionOuvertureUrl, type SessionQualification } from './qualification/connexionOAuth'
import { fixtureRetraitVarianteAnon } from '../test/fixtures/retraitVarianteAnon'
import { ClientGitLab } from '../src/main/gitlab/client'
import { BailGitLab, DepotCommitsGitLabClient, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../src/main/gitlab/bailGitLab'
import type { EntretienFichier } from '../src/shared/format'

const config = { url: process.env.GITLAB_URL?.replace(/\/$/, ''), token: process.env.GITLAB_USER1_TOKEN, token2: process.env.GITLAB_USER2_TOKEN,
  clientId: process.env.GITLAB_OAUTH_CLIENT_ID, utilisateur: process.env.GITLAB_OAUTH_USER1 ?? 'user1', motDePasse: process.env.GITLAB_OAUTH_PASSWORD1, ca: process.env.GITLAB_CA }
const presente = Boolean(config.url && config.token && config.token2 && config.clientId && config.motDePasse)
const action = 'Remplacer les choix et retirer la variante'
async function api<T>(chemin: string, init: RequestInit = {}, token = config.token!): Promise<T> {
  const headers = new Headers(init.headers); headers.set('PRIVATE-TOKEN', token)
  if (init.body) headers.set('Content-Type', 'application/json')
  const r = await fetch(`${config.url}/api/v4${chemin}`, { ...init, headers, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) { await r.body?.cancel(); throw new Error(`Fixture GitLab refusée : HTTP ${r.status}`) }
  return await r.json() as T
}
function lancerProfil(profil: string, shim: InterceptionOuvertureUrl, preserverSettings = false) {
  return lancer(profil, { preserverSettings, repertoireApplication: process.env.SONAL_E2E_APPLICATION,
    env: { PATH: pathAvecShim(shim.repertoire), SONAL_URL_OUVRTE: shim.fichierUrl } })
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
  await authentifier(page, shim, session, /^Ouvrir le corpus$/)
  await fermerAiguillage(page, 'entretiens', 120_000)
  await attendreCorpus(page)
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function rouvrir(page: Page, shim: InterceptionOuvertureUrl, session: SessionQualification) {
  await attendreAccueil(page); await page.locator('.recent').first().click()
  await expect(page.locator('.modale-distant')).toBeVisible()
  await authentifier(page, shim, session, /^Se reconnecter et ouvrir$/)
  await fermerAiguillage(page, 'entretiens', 120_000)
  await attendreCorpus(page)
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}
async function dialogueRetrait(page: Page) {
  await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
  const edition = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
  await edition.getByLabel('Pseudonymes', { exact: true }).fill('Rebecca')
  await edition.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  const dialogue = page.getByRole('dialog', { name: 'Retirer une variante', exact: true })
  await expect(dialogue).toBeVisible()
  return dialogue
}
async function preparer(page: Page) {
  const dialogue = await dialogueRetrait(page)
  await expect(dialogue.getByRole('checkbox')).toHaveCount(0)
  await dialogue.getByRole('button', { name: 'Préparer le retrait de variante', exact: true }).click()
  await expect(dialogue).toContainText('6 choix à remplacer dans 2 entretien(s)', { timeout: 30_000 })
  return dialogue
}
async function confirmer(dialogue: ReturnType<Page['getByRole']>) {
  await dialogue.getByRole('checkbox').check()
  await dialogue.getByRole('button', { name: action, exact: true }).click()
}
type Sonde = { mode: 'normal' | 'perte' | 'kill'; accepte: boolean; publies: string[] }
async function instrumenter(app: ElectronApplication, projet: number, mode: Sonde['mode'] = 'normal') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeRetrait: Sonde }, original = g.fetch
    g.sondeRetrait = { mode: args.mode, accepte: false, publies: [] }
    g.fetch = async (url, init) => {
      const adresse = new URL(url instanceof Request ? url.url : String(url)), s = g.sondeRetrait
      if (s.mode === 'perte' && s.accepte && adresse.searchParams.has('search')) throw new Error('Historique synthétique indisponible')
      let phase = ''
      if (adresse.pathname === `/api/v4/projects/${args.projet}/repository/commits` && init?.method === 'POST') {
        const commit = JSON.parse(String(init.body))
        if (commit.commit_message.startsWith('Sonal retrait-variante-')) {
          const a = commit.actions.find((a: { action: string; file_path: string }) => a.action === 'update' && (a.file_path === 'corpus.json' || a.file_path.startsWith('entretiens/')))
          if (a.file_path === 'corpus.json') {
            const c = JSON.parse(a.encoding === 'base64' ? Buffer.from(a.content, 'base64').toString('utf8') : a.content)
            phase = c.retraitVarianteAnon ? 'barriere' : 'retrait'
          } else phase = a.file_path.split('/').at(-1).replace('.json', '')
        }
      }
      const r = await original(url, init)
      if (phase && r.ok) {
        s.publies.push(phase)
        if (s.mode === 'kill' && phase === 'e1') { s.accepte = true; await r.body?.cancel(); await new Promise(() => {}) }
        if (s.mode === 'perte' && phase === 'retrait') { s.accepte = true; await r.body?.cancel(); throw new Error('Réponse synthétique perdue') }
      }
      return r
    }
  }, { projet, mode })
}
const phases = (app: ElectronApplication) => app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.publies)
async function banc(suffixe: string) {
  const id = randomUUID(), projet = await api<{ id: number; path_with_namespace: string }>('/projects', { method: 'POST', body: JSON.stringify({ name: `Sonal retrait ${suffixe} ${id}`, path: `sonal-retrait-${id}`, initialize_with_readme: true, default_branch: 'main', visibility: 'private' }) })
  const f = fixtureRetraitVarianteAnon(); f.corpus.nom = 'Retrait synthétique'
  await api(`/projects/${projet.id}/repository/commits`, { method: 'POST', body: JSON.stringify({ branch: 'main', commit_message: 'fixture : retrait synthétique', actions: [
    { action: 'create', file_path: 'corpus.json', content: JSON.stringify(f.corpus) }, ...f.sources.map((s) => ({ action: 'create', file_path: `entretiens/${s.id}.json`, content: JSON.stringify(s.data) })),
  ] }) })
  const second = await api<{ id: number }>('/user', {}, config.token2!)
  await api(`/projects/${projet.id}/members`, { method: 'POST', body: JSON.stringify({ user_id: second.id, access_level: 40 }) })
  await expect.poll(async () => { try { return (await api<{ can_push: boolean }>(`/projects/${projet.id}/repository/branches/main`, {}, config.token2!)).can_push } catch { return false } }, { timeout: 90_000, intervals: [500, 1_000, 2_000, 5_000] }).toBe(true)
  const depot = new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: config.url!, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: config.token! } }))
  const bob = new BailGitLab({ branche: 'main', depot: new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: config.url!, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: config.token2! } })), identite: () => ({ userId: String(second.id), machineId: 'fixture-bob', sessionId: suffixe }) })
  const lire = (id: string) => depot.lireFichier(id === 'corpus' ? 'corpus.json' : `entretiens/${id}.json`, 'main')
  return { f, projet, depot, bob, lire }
}
function remplacer(avant: EntretienFichier, date: string) {
  const attendu = JSON.parse(JSON.stringify(avant)) as EntretienFichier
  for (const a of attendu.annotations) if (a.type === 'anon' && a.regle === 'personne' && a.pseudo === 'Claire') a.pseudo = 'Rebecca'
  attendu.lastModified = date
  return attendu
}

test.describe('Retrait de variante GitLab — parcours normal dans l’application', () => {
  test.skip(!presente, 'variables GitLab OAuth/deux comptes absentes')
  test.setTimeout(240_000)
  test('retrait par slash : annulation, accord, ressources tenues et nouveaux choix examinés', async ({ browser }, info) => {
    const b = await banc('partiel'), profil = mkdtempSync(join(tmpdir(), 'sonal-retrait-oauth-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const tenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e2.json')); if (!tenu.ok) throw new Error('Fixture cible')
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenter(app, b.projet.id); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const nonCible = await b.lire('e3'), cheminBail = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'entretiens/e2.json')), bail = await b.depot.lireFichier(cheminBail, 'main')
      let dialogue = await preparer(page)
      await expect(dialogue).toContainText('3 exception(s) et 2 choix masqué(s)')
      await expect(dialogue.getByRole('button', { name: action, exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('retrait-gitlab-normal.png') })
      await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('retrait-gitlab-reduit.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click(); expect(await phases(app)).toEqual([])
      const consommation = await page.evaluate(async (demande) => {
        const a = await window.sonal.corpus.apercuRetraitVarianteAnon(demande)
        a.demande.pseudoConserve = 'Forgerie'
        let premier = '', second = ''
        try { await window.sonal.corpus.retirerVarianteAnon(a.token, false) } catch (e) { premier = String(e) }
        try { await window.sonal.corpus.retirerVarianteAnon(a.token, true) } catch (e) { second = String(e) }
        return { premier, second }
      }, b.f.demande)
      expect(consommation.premier).toContain('Confirmez'); expect(consommation.second).toContain('expiré')
      const corpusTenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'corpus.json')); if (!corpusTenu.ok) throw new Error('Fixture corpus')
      try {
        dialogue = await preparer(page); await confirmer(dialogue)
        await expect(dialogue.getByRole('button', { name: 'Relire le suivi GitLab', exact: true })).toBeEnabled()
        await dialogue.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
        await expect(dialogue).toContainText('Aucun suivi correspondant n’a été trouvé')
        await expect(dialogue.getByRole('button', { name: 'Préparer le retrait de variante', exact: true })).toBeDisabled()
        expect(await phases(app)).toEqual([])
        await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
      } finally { await b.bob.liberer(corpusTenu.droit) }
      dialogue = await preparer(page); await confirmer(dialogue)
      await expect(dialogue).toContainText('3 choix remplacé(s) dans 1 entretien(s)', { timeout: 30_000 })
      await expect(dialogue.getByRole('checkbox')).toHaveCount(0)
      expect(await b.lire('e3')).toEqual(nonCible); expect(await b.depot.lireFichier(cheminBail, 'main')).toEqual(bail)
      expect(JSON.parse((await b.lire('corpus'))!.contenu).reglesAnon.personne.pseudos).toEqual(['Claire', 'Rebecca'])
      await page.screenshot({ path: info.outputPath('retrait-gitlab-partiel.png') })
      const source = (await b.lire('e3'))!, nouveau = JSON.parse(source.contenu) as EntretienFichier
      nouveau.annotations[0].pseudo = 'Claire'
      await b.depot.publierCommit('main', 'fixture : ancien choix direct hors protocole', [{ action: 'update', file_path: source.chemin, last_commit_id: source.commitId, content: JSON.stringify(nouveau) }])
      await b.bob.liberer(tenu.droit)
      await dialogue.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(dialogue).toContainText('4 choix à remplacer dans 2 entretien(s)', { timeout: 30_000 })
      await expect(dialogue.getByRole('checkbox')).not.toBeChecked(); await confirmer(dialogue)
      await expect(dialogue).toHaveCount(0, { timeout: 30_000 })
      expect(await phases(app)).toEqual(['barriere', 'e1', 'e2', 'e3', 'retrait'])
      for (const s of b.f.sources) {
        const actuel = JSON.parse((await b.lire(s.id))!.contenu)
        expect(actuel).toEqual(remplacer(s.id === 'e3' ? nouveau : s.data, actuel.lastModified))
      }
      const attendu = structuredClone(b.f.corpus); attendu.reglesAnon.personne.pseudos = ['Rebecca']
      expect(JSON.parse((await b.lire('corpus'))!.contenu)).toEqual(attendu)
    } finally { await Promise.allSettled([app.close(), session.fermer(), b.bob.liberer(tenu.droit)]); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('édition sauvée, définition changée refusée, nouveau bilan et seules valeurs liées remplacées', async ({ browser }) => {
    const b = await banc('edition'), profil = mkdtempSync(join(tmpdir(), 'sonal-retrait-edition-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenter(app, b.projet.id); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      await retourCorpus(page)
      await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click()
      await expect(page.locator('.editeur')).toContainText('Rue Karine. Local.')
      await page.locator('.editeur').press('Control+End'); await page.locator('.editeur').press('End'); await page.keyboard.insertText(' Édition indépendante conservée.')
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 15_000 })
      await retourCorpus(page); await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      const avant = (await b.lire('e1'))!.contenu
      expect(avant).toContain('Édition indépendante conservée.')
      let dialogue = await preparer(page); await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect((await b.lire('e1'))!.contenu).toBe(avant)
      dialogue = await preparer(page)
      const source = (await b.lire('corpus'))!, concurrent = JSON.parse(source.contenu)
      concurrent.reglesAnon.personne.categorie = 'Autre'
      await b.depot.publierCommit('main', 'fixture : catégorie changée après bilan', [{ action: 'update', file_path: 'corpus.json', last_commit_id: source.commitId, content: JSON.stringify(concurrent) }])
      await confirmer(dialogue); await expect(dialogue).toContainText('Le retrait n’a pas pu être terminé')
      expect(await phases(app)).toEqual([])
      await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
      await page.locator('.synchro-zone button').click(); await expect(page.locator('.synchro-zone button')).toBeEnabled()
      await expect(page.locator('.pseudo-table tbody tr', { hasText: 'Karine' }).getByText('Autre', { exact: true })).toBeVisible()
      dialogue = await preparer(page); await confirmer(dialogue); await expect(dialogue).toHaveCount(0, { timeout: 30_000 })
      const actuel = JSON.parse((await b.lire('e1'))!.contenu)
      expect(actuel).toEqual(remplacer(JSON.parse(avant), actuel.lastModified))
      expect(JSON.parse((await b.lire('corpus'))!.contenu).reglesAnon.personne).toMatchObject({ pseudos: ['Rebecca'], categorie: 'Autre' })
      expect((await b.lire('e3'))!.contenu).toBe(JSON.stringify(b.f.sources[2].data))
      expect(await phases(app)).toEqual(['barriere', 'e1', 'e2', 'retrait'])
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('lot partiel : entretien indépendant encore lié à Rebecca éditable puis conservé exactement', async ({ browser }) => {
    const b = await banc('independant'), profil = mkdtempSync(join(tmpdir(), 'sonal-retrait-independant-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const tenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e2.json')); if (!tenu.ok) throw new Error('Fixture cible')
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenter(app, b.projet.id); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const dialogue = await preparer(page); await confirmer(dialogue)
      await expect(dialogue).toContainText('3 choix remplacé(s) dans 1 entretien(s)', { timeout: 30_000 })
      await dialogue.getByRole('button', { name: 'Annuler', exact: true }).click()
      await retourCorpus(page)
      await page.locator('.carte-ent', { hasText: 'Entretien e3' }).locator('.crayon').click()
      await expect(page.locator('.editeur')).toContainText('Rue Karine. Local.')
      await page.locator('.editeur').press('Control+End'); await page.locator('.editeur').press('End')
      await page.keyboard.insertText(' Modification indépendante de la non-cible.')
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 15_000 })
      await retourCorpus(page)
      const conserve = await b.lire('e3'); expect(conserve!.contenu).toContain('Modification indépendante de la non-cible.')
      await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      await b.bob.liberer(tenu.droit)
      await page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true }).click()
      const reprise = page.getByRole('dialog', { name: 'Retirer une variante', exact: true })
      await expect(page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })).toHaveCount(0)
      await reprise.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(reprise).toContainText('3 choix à remplacer dans 1 entretien(s)', { timeout: 30_000 })
      await expect(reprise.getByRole('checkbox')).not.toBeChecked(); await confirmer(reprise)
      await expect(reprise).toHaveCount(0, { timeout: 30_000 })
      expect(await b.lire('e3')).toEqual(conserve)
      expect(await phases(app)).toEqual(['barriere', 'e1', 'e2', 'retrait'])
    } finally { await Promise.allSettled([app.close(), session.fermer(), b.bob.liberer(tenu.droit)]); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('retrait final accepté, réponse perdue : suivi incertain puis succès sans répétition', async ({ browser }, info) => {
    const b = await banc('perte'), profil = mkdtempSync(join(tmpdir(), 'sonal-retrait-perte-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenter(app, b.projet.id, 'perte'); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const dialogue = await preparer(page); await confirmer(dialogue)
      await expect(dialogue).toContainText('Le serveur n’a pas confirmé le résultat', { timeout: 30_000 })
      await expect(dialogue.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('retrait-gitlab-indetermine.png') })
      expect(JSON.parse((await b.lire('corpus'))!.contenu).reglesAnon.personne.pseudos).toEqual(['Rebecca'])
      const acquis = await b.lire('e1')
      await app.evaluate(() => { (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.mode = 'normal' })
      await dialogue.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
      await expect(dialogue).toHaveCount(0, { timeout: 30_000 })
      expect(await phases(app)).toEqual(['barriere', 'e1', 'e2', 'retrait']); expect(await b.lire('e1')).toEqual(acquis)
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('SIGKILL après premier remplacement : suivi retrouvé, droits persistants refusés puis reprise restante', async ({ browser }, info) => {
    const b = await banc('kill'), profil = mkdtempSync(join(tmpdir(), 'sonal-retrait-kill-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(config.ca))
    let app = await lancerProfil(profil, shim), mort = false
    try {
      await instrumenter(app, b.projet.id, 'kill'); const page = await app.firstWindow(); await ouvrir(page, shim, session, b.projet)
      const dialogue = await preparer(page); await confirmer(dialogue)
      await expect.poll(() => app.evaluate(() => (globalThis as unknown as { sondeRetrait: Sonde }).sondeRetrait.accepte), { timeout: 30_000 }).toBe(true)
      const baux = await Promise.all(['corpus.json', 'entretiens/e1.json'].map(async (chemin) => {
        const path = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', chemin)), source = (await b.depot.lireFichier(path, 'main'))!
        return { path, source, bail: JSON.parse(source.contenu) }
      }))
      const acquis = await b.lire('e1'), nonCible = await b.lire('e3')
      const processus = app.process(), sortie = new Promise<void>((resolve) => processus.once('exit', () => resolve()))
      expect(processus.kill('SIGKILL')).toBe(true); await sortie; mort = true; expect(processus.signalCode).toBe('SIGKILL')
      app = await lancerProfil(profil, shim, true); await instrumenter(app, b.projet.id)
      const reprise = await app.firstWindow(); await rouvrir(reprise, shim, session)
      await expect(reprise.getByText('Retrait de variante GitLab à reprendre', { exact: true })).toBeVisible()
      await reprise.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
      await expect.poll(async () => {
        const suivi = await reprise.evaluate(() => window.sonal.corpus.suiviRetraitVarianteAnon())
        return suivi?.statut === 'partiel' && suivi.annotations === 3
      }).toBe(true)
      for (const bail of baux) expect(await b.depot.lireFichier(bail.path, 'main')).toEqual(bail.source)
      await reprise.getByRole('button', { name: 'Examiner le retrait de variante', exact: true }).click()
      const suivi = reprise.getByRole('dialog', { name: 'Retirer une variante', exact: true })
      await suivi.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(suivi).toContainText('3 choix à remplacer dans 1 entretien(s)', { timeout: 30_000 }); await confirmer(suivi)
      await expect(suivi).toContainText('La ressource est tenue par un autre poste', { timeout: 30_000 })
      await expect(suivi.getByRole('button', { name: 'Annuler', exact: true })).toBeEnabled()
      expect(await phases(app)).toEqual([])
      await reprise.screenshot({ path: info.outputPath('retrait-gitlab-bail-persistant.png') })
      expect(await b.lire('e1')).toEqual(acquis); expect(await b.lire('e3')).toEqual(nonCible)
      expect(mort).toBe(true)
      // La libération appartient au harnais après preuve de mort, jamais à l’application.
      const compte = await api<{ id: number; username: string }>('/user')
      for (const bail of baux) {
        expect([String(compte.id), compte.username]).toContain(bail.bail.holder.userId)
        expect(await b.depot.lireFichier(bail.path, 'main')).toEqual(bail.source)
        const externe = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: bail.bail.holder.userId, machineId: 'fixture', sessionId: 'mort-prouvee' }) })
        expect(await externe.rendreBailNotre(bail.path, bail.bail.generation)).toBe('libere')
      }
      await suivi.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(suivi.getByRole('checkbox')).not.toBeChecked(); await confirmer(suivi)
      await expect(suivi).toHaveCount(0, { timeout: 30_000 })
      expect(await phases(app)).toEqual(['e2', 'retrait'])
      expect(await b.lire('e1')).toEqual(acquis); expect(await b.lire('e3')).toEqual(nonCible)
      expect(JSON.parse((await b.lire('corpus'))!.contenu).reglesAnon.personne.pseudos).toEqual(['Rebecca'])
    } finally { await app.close().catch(() => undefined); await session.fermer(); shim.nettoyer(); if (mort) rmSync(profil, { recursive: true, force: true }) }
  })
})
