/**
 *  Suppression textuelle GitLab par l’entrée normale OAuth de l’application.
 *  Les projets et profils sont synthétiques ; les commits restent examinables.
 *  Le harnais seul utilise les jetons personnels pour préparer et vérifier les données.
 */

import { expect, test, type Page, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  attendreUrlAutorisation,
  consentir,
  intercepterOuvertureUrl,
  pathAvecShim,
  sessionQualification,
  type IdentifiantsGitLab,
  type InterceptionOuvertureUrl,
  type SessionQualification,
} from './qualification/connexionOAuth'
import { lancer, attendreAccueil, attendreCorpus, fermerAiguillage, retourCorpus } from './util'
import { fixtureDissociationAnon } from '../test/fixtures/dissociationAnon'
import { ClientGitLab } from '../src/main/gitlab/client'
import { BailGitLab, DepotCommitsGitLabClient, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../src/main/gitlab/bailGitLab'

const configuration = {
  url: process.env.GITLAB_URL?.replace(/\/$/, ''),
  projetId: process.env.GITLAB_LFS_PROJECT_ID,
  token1: process.env.GITLAB_USER1_TOKEN,
  token2: process.env.GITLAB_USER2_TOKEN,
  clientId: process.env.GITLAB_OAUTH_CLIENT_ID,
  utilisateur: process.env.GITLAB_OAUTH_USER1 ?? 'user1',
  motDePasse: process.env.GITLAB_OAUTH_PASSWORD1,
  ca: process.env.GITLAB_CA,
}
// L’application utilise OAuth ; les jetons personnels sont réservés au harnais.
const configurationPresente = Boolean(
  configuration.url &&
  configuration.projetId &&
  configuration.token1 &&
  configuration.clientId &&
  configuration.motDePasse,
)
const idExecution = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const executableEmpaquete = process.env.GITLAB_E2E_PACKAGED === '1'
  ? join(process.cwd(), 'dist/linux-unpacked/sonalpi2')
  : undefined

/** Chaque poste testé intercepte sa propre ouverture d'URL. */
function lancerProfil(
  userDataDir: string,
  interception: InterceptionOuvertureUrl,
  preserverSettings = false,
) {
  return lancer(userDataDir, {
    preserverSettings,
    executablePath: executableEmpaquete,
    env: {
      PATH: pathAvecShim(interception.repertoire),
      SONAL_URL_OUVRTE: interception.fichierUrl,
    },
  })
}

function identifiantsDe(utilisateur: string): IdentifiantsGitLab {
  return {
    utilisateur,
    motDePasse: utilisateur === (process.env.GITLAB_OAUTH_USER2 ?? 'user2')
      ? (process.env.GITLAB_OAUTH_PASSWORD2 ?? '')
      : (configuration.motDePasse as string),
  }
}

/** Prépare les seuls renseignements demandés avant l'action finale. */
async function remplirAccesGitLab(
  page: Page,
  projetId: string,
  racineCourante: string,
  jetonPourAdresse = configuration.token1 as string,
): Promise<void> {
  const onglet = page.getByRole('tab', { name: 'GitLab' })
  await onglet.evaluate((element: HTMLButtonElement) => element.click())
  await expect(onglet).toHaveAttribute('aria-selected', 'true')
  await page.locator('.url-projet-gitlab').fill(
    await adresseProjet(jetonPourAdresse, projetId),
  )
  await page.locator('.client-id-gitlab').fill(configuration.clientId as string)
  if (racineCourante) {
    const options = page.locator('details.options-gitlab')
    if (!await options.getAttribute('open')) await options.locator('summary').click()
    await page.locator('.racine-gitlab').fill(racineCourante)
  }
}

/** Joue le consentement déclenché par l'unique bouton du formulaire. */
async function consentirApresAction(
  page: Page,
  interception: InterceptionOuvertureUrl,
  session: SessionQualification,
  identifiants: IdentifiantsGitLab,
  bouton: RegExp,
): Promise<void> {
  await page.getByRole('button', { name: bouton }).click()
  const urlAutorisation = await attendreUrlAutorisation(interception)
  const navigateur = await session.newPage()
  try {
    await navigateur.goto(urlAutorisation)
    await consentir(navigateur, identifiants)
  } finally {
    await navigateur.close()
  }
}

async function ouvrirDepuisFormulaireGitLab(
  page: Page,
  interception: InterceptionOuvertureUrl,
  session: SessionQualification,
  identifiants: IdentifiantsGitLab,
  racineCourante: string,
  projetId = configuration.projetId as string,
  jetonPourAdresse = configuration.token1 as string,
): Promise<void> {
  await remplirAccesGitLab(page, projetId, racineCourante, jetonPourAdresse)
  await consentirApresAction(
    page,
    interception,
    session,
    identifiants,
    /^Ouvrir le corpus$/,
  )
  // Première ouverture de ce corpus sur le poste : l'aiguillage mène aux entretiens.
  await fermerAiguillage(page, 'entretiens', 120_000)
}

async function api<T>(
  chemin: string,
  jeton: string,
  initialisation: RequestInit = {},
): Promise<T> {
  const entetes = new Headers(initialisation.headers)
  entetes.set('PRIVATE-TOKEN', jeton)
  if (initialisation.body) entetes.set('Content-Type', 'application/json')
  const reponse = await fetch(`${configuration.url}/api/v4${chemin}`, {
    ...initialisation,
    headers: entetes,
    signal: AbortSignal.timeout(20_000),
  })
  if (!reponse.ok) {
    await reponse.body?.cancel()
    throw new Error(`Appel GitLab E2E refusé (HTTP ${reponse.status}).`)
  }
  return (await reponse.json()) as T
}

async function adresseProjet(
  jeton: string,
  projetId = configuration.projetId as string,
): Promise<string> {
  const projet = await api<{ path_with_namespace: string }>(
    `/projects/${projetId}`,
    jeton,
  )
  return `${(configuration.url as string).replace(/\/$/, '')}/${projet.path_with_namespace}`
}

type SondeSuppression = { mode: string; accepte: boolean; publies: string[] }
async function instrumenterSuppression(app: ElectronApplication, projet: number, mode = 'normal') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeSuppression: SondeSuppression }
    const original = g.fetch
    g.sondeSuppression = { mode: args.mode, accepte: false, publies: [] }
    g.fetch = async (url, init) => {
      const adresse = new URL(url instanceof Request ? url.url : String(url)), s = g.sondeSuppression
      if (s.mode === 'perte-finale' && s.accepte && adresse.searchParams.has('search')) throw new Error('Historique synthétique indisponible')
      let phase = ''
      if (adresse.pathname === `/api/v4/projects/${args.projet}/repository/commits` && init?.method === 'POST') {
        const commit = JSON.parse(String(init.body))
        if (commit.commit_message.startsWith('Sonal suppression-anon-')) {
          const a = commit.actions.find((a: { action: string; file_path: string }) => a.action === 'update' && (a.file_path === 'corpus.crp' || a.file_path.startsWith('entretiens/')))
          if (a.file_path === 'corpus.crp') {
            const contenu = JSON.parse(a.encoding === 'base64' ? Buffer.from(a.content, 'base64').toString('utf8') : a.content)
            phase = contenu.reglesAnon.personne ? 'barriere' : 'retrait'
          } else phase = a.file_path.split('/').at(-1).replace('.json', '')
        }
      }
      const reponse = await original(url, init)
      if (phase && reponse.ok) {
        s.publies.push(phase)
        if (s.mode === 'kill' && phase === 'e1') { s.accepte = true; await reponse.body?.cancel(); await new Promise(() => {}) }
        if (s.mode === 'perte-finale' && phase === 'retrait') { s.accepte = true; await reponse.body?.cancel(); throw new Error('Réponse synthétique perdue') }
      }
      return reponse
    }
  }, { projet, mode })
}
async function bancSuppression(suffixe: string) {
  test.skip(!configuration.token2, 'second compte GitLab du harnais absent')
  const projet = await api<{ id: number }>('/projects', configuration.token1 as string, { method: 'POST', body: JSON.stringify({ name: `Sonal suppression ${suffixe} ${idExecution}`, path: `sonal-suppression-${suffixe}-${idExecution}`, initialize_with_readme: true, default_branch: 'main', visibility: 'private' }) })
  const f = fixtureDissociationAnon()
  f.corpus.nom = 'Suppression synthétique'
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable synthétique', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur synthétique', mExport: 1 }] }
  await api(`/projects/${projet.id}/repository/commits`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ branch: 'main', commit_message: 'qualification : suppression synthétique', actions: [
    { action: 'create', file_path: 'corpus.crp', content: JSON.stringify(f.corpus) }, ...f.sources.map((s) => ({ action: 'create', file_path: `entretiens/${s.id}.json`, content: JSON.stringify(s.data) })),
  ] }) })
  const second = await api<{ id: number }>('/user', configuration.token2 as string)
  await api(`/projects/${projet.id}/members`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ user_id: second.id, access_level: 40 }) })
  await expect.poll(async () => { try { return (await api<{ can_push: boolean }>(`/projects/${projet.id}/repository/branches/main`, configuration.token2 as string)).can_push } catch { return false } }, { timeout: 90_000, intervals: [500, 1_000, 2_000, 5_000] }).toBe(true)
  const depot = new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: configuration.url as string, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: configuration.token1 as string } }))
  const bob = new BailGitLab({ branche: 'main', depot: new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: configuration.url as string, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: configuration.token2 as string } })), identite: () => ({ userId: String(second.id), machineId: 'qualification-bob', sessionId: suffixe }) })
  return { projet, f, depot, bob }
}
async function ouvrirSuppression(page: Page) {
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await page.getByRole('button', { name: 'Supprimer partout Karine', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Supprimer une règle partout', exact: true })
  await modal.getByRole('button', { name: 'Préparer la suppression globale', exact: true }).click()
  await expect(modal).toContainText('8 passage(s) concerné(s)', { timeout: 30_000 })
  return modal
}
async function rouvrirSuppression(page: Page, shim: InterceptionOuvertureUrl, session: SessionQualification) {
  await attendreAccueil(page); await page.locator('.recent').first().click()
  await expect(page.locator('.modale-distant')).toBeVisible()
  await consentirApresAction(page, shim, session, identifiantsDe(configuration.utilisateur as string), /^Se reconnecter et ouvrir$/)
  await attendreCorpus(page); await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}

test.describe('Suppression partout GitLab — qualification produit', () => {
  test.skip(!configurationPresente, 'variables GITLAB_* absentes')
  test.setTimeout(180_000)
  test('suppression GitLab OAuth : annuler, cible tenue, nouveaux usages et consentement renouvelé', async ({ browser }, info) => {
    const b = await bancSuppression('partiel')
    const tenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e2.json'))
    if (!tenu.ok) throw new Error('Bail synthétique cible indisponible')
    const profil = mkdtempSync(join(tmpdir(), 'sonal-suppression-oauth-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenterSuppression(app, b.projet.id)
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      let modal = await ouvrirSuppression(page)
      await expect(modal).toContainText('Sur GitLab, les entretiens sont mis à jour l’un après l’autre')
      await expect(modal.getByRole('button', { name: 'Confirmer la suppression globale' })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('suppression-gitlab-normale.png') })
      await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('suppression-gitlab-reduite.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.publies)).toEqual([])
      const consommation = await page.evaluate(async () => {
        const a = await window.sonal.corpus.apercuSuppressionAnon({ regleId: 'personne' })
        a.regle.pseudos = ['Forgerie']
        let premier = '', second = ''
        try { await window.sonal.corpus.supprimerRegleAnonPartout(a.token, false) } catch (e) { premier = String(e) }
        try { await window.sonal.corpus.supprimerRegleAnonPartout(a.token, true) } catch (e) { second = String(e) }
        return { premier, second }
      })
      expect(consommation.premier).toContain('Confirmez'); expect(consommation.second).toContain('expiré')
      const corpusTenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'corpus.crp'))
      if (!corpusTenu.ok) throw new Error('Bail synthétique corpus indisponible')
      try {
        modal = await ouvrirSuppression(page); await modal.getByRole('checkbox').check()
        await modal.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
        await expect(modal.getByRole('button', { name: 'Relire le suivi GitLab' })).toBeEnabled()
        await modal.getByRole('button', { name: 'Relire le suivi GitLab' }).click()
        await expect(modal).toContainText('Aucun suivi n’a été trouvé')
        expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.publies)).toEqual([])
        expect(JSON.parse((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu)).toEqual(b.f.sources.find((s) => s.id === 'e1')!.data)
        await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      } finally { await b.bob.liberer(corpusTenu.droit) }
      modal = await ouvrirSuppression(page); await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect(modal).toContainText('4 choix retiré(s) dans 1 entretien(s)', { timeout: 30_000 })
      await expect(modal.getByRole('checkbox')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('suppression-gitlab-partielle.png') })
      const source = (await b.depot.lireFichier('entretiens/e3.json', 'main'))!
      b.f.sources[2].data.annotations = [structuredClone(b.f.sources[0].data.annotations[0])]
      await b.depot.publierCommit('main', 'qualification : nouvel usage hors protocole', [{ action: 'update', file_path: source.chemin, last_commit_id: source.commitId, content: JSON.stringify(b.f.sources[2].data) }])
      await b.bob.liberer(tenu.droit)
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('5 passage(s) concerné(s)', { timeout: 30_000 }); await expect(modal.getByRole('checkbox')).not.toBeChecked()
      await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect(modal).toHaveCount(0, { timeout: 30_000 })
      expect(JSON.parse((await b.depot.lireFichier('corpus.crp', 'main'))!.contenu).reglesAnon.personne).toBeUndefined()
      for (const source of b.f.sources) {
        const actuel = JSON.parse((await b.depot.lireFichier(`entretiens/${source.id}.json`, 'main'))!.contenu)
        const attendu = structuredClone(source.data); attendu.lastModified = actuel.lastModified
        attendu.annotations = attendu.annotations.filter((a) => a.regle !== 'personne')
        expect(actuel).toEqual(attendu)
      }
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.publies)).toEqual(['barriere', 'e1', 'e2', 'e3', 'retrait'])
    } finally { await Promise.allSettled([app.close(), session.fermer(), b.bob.liberer(tenu.droit)]); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('suppression GitLab : retour normal depuis l’édition, annulation puis mémoire et texte conservés', async ({ browser }) => {
    const b = await bancSuppression('edition'), profil = mkdtempSync(join(tmpdir(), 'sonal-suppression-edition-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenterSuppression(app, b.projet.id)
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click()
      await expect(page.locator('.editeur')).toContainText('Rue Karine. Local.')
      await page.locator('.editeur').press('Control+End'); await page.locator('.editeur').press('End')
      await page.keyboard.insertText(' Ajout conservé avant suppression.')
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 15_000 })
      await retourCorpus(page)
      const avant = (await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu
      expect(avant).toContain('Ajout conservé avant suppression.')
      const modal = await ouvrirSuppression(page)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu).toBe(avant)
      const frais = await ouvrirSuppression(page); await frais.getByRole('checkbox').check()
      await frais.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect(frais).toHaveCount(0, { timeout: 30_000 })
      const actuel = JSON.parse((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu), attendu = JSON.parse(avant)
      attendu.annotations = attendu.annotations.filter((a: { regle?: string }) => a.regle !== 'personne')
      attendu.lastModified = actuel.lastModified
      expect(actuel).toEqual(attendu)
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('suppression GitLab OAuth : retrait accepté, réponse perdue et suivi sans rejeu', async ({ browser }, info) => {
    const b = await bancSuppression('retrait-incertain'), profil = mkdtempSync(join(tmpdir(), 'sonal-suppression-suivi-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenterSuppression(app, b.projet.id, 'perte-finale')
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      const modal = await ouvrirSuppression(page); await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect(modal).toContainText('Le serveur n’a pas confirmé le résultat', { timeout: 30_000 })
      await expect(modal.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('suppression-gitlab-indeterminee.png') })
      expect(JSON.parse((await b.depot.lireFichier('corpus.crp', 'main'))!.contenu).reglesAnon.personne).toBeUndefined()
      await app.evaluate(() => { (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.mode = 'normal' })
      await modal.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
      await expect(modal).toHaveCount(0, { timeout: 30_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.publies)).toEqual(['barriere', 'e1', 'e2', 'retrait'])
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('suppression GitLab OAuth : SIGKILL après retrait accepté, bail persistant refusé puis reprise restante', async ({ browser }, info) => {
    const b = await bancSuppression('sigkill'), profil = mkdtempSync(join(tmpdir(), 'sonal-suppression-kill-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    let app = await lancerProfil(profil, shim), mort = false
    try {
      await instrumenterSuppression(app, b.projet.id, 'kill')
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      const modal = await ouvrirSuppression(page); await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect.poll(() => app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.accepte), { timeout: 30_000 }).toBe(true)
      const cheminBail = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'corpus.crp'))
      const bailAvant = JSON.parse((await b.depot.lireFichier(cheminBail, 'main'))!.contenu)
      const cheminEntretien = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'entretiens/e1.json'))
      const bailEntretien = JSON.parse((await b.depot.lireFichier(cheminEntretien, 'main'))!.contenu)
      const acquis = (await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu
      const processus = app.process(), sortie = new Promise<void>((resolve) => processus.once('exit', () => resolve()))
      expect(processus.kill('SIGKILL')).toBe(true); await sortie; mort = true
      expect(processus.signalCode).toBe('SIGKILL')
      app = await lancerProfil(profil, shim, true); await instrumenterSuppression(app, b.projet.id)
      const reprise = await app.firstWindow(); await rouvrirSuppression(reprise, shim, session)
      await expect(reprise.getByText('Lot GitLab de suppression à reprendre', { exact: true })).toBeVisible()
      await reprise.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
      await expect(reprise.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeEnabled({ timeout: 30_000 })
      await reprise.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      const dialogue = reprise.getByRole('dialog', { name: 'Supprimer une règle partout', exact: true })
      await dialogue.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(dialogue).toContainText('4 passage(s) concerné(s)', { timeout: 30_000 })
      await dialogue.getByRole('checkbox').check(); await dialogue.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect(dialogue).toContainText('La ressource est tenue par un autre poste', { timeout: 30_000 })
      await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeEnabled()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.publies)).toEqual([])
      await reprise.screenshot({ path: info.outputPath('suppression-gitlab-bail-persistant.png') })
      expect((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu).toBe(acquis)
      const actuel = JSON.parse((await b.depot.lireFichier(cheminBail, 'main'))!.contenu)
      expect(actuel.generation).toBe(bailAvant.generation)
      // Seul le banc intervient, après preuve de mort du processus synthétique.
      expect(mort).toBe(true)
      const compte = await api<{ id: number; username: string }>('/user', configuration.token1 as string)
      expect([String(compte.id), compte.username]).toContain(bailAvant.holder.userId)
      const externe = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: bailAvant.holder.userId, machineId: 'fixture', sessionId: 'preuve-mort' }) })
      expect(JSON.parse((await b.depot.lireFichier(cheminEntretien, 'main'))!.contenu).generation).toBe(bailEntretien.generation)
      expect(bailEntretien.holder.userId).toBe(bailAvant.holder.userId)
      expect(await externe.rendreBailNotre(cheminBail, bailAvant.generation)).toBe('libere')
      expect(await externe.rendreBailNotre(cheminEntretien, bailEntretien.generation)).toBe('libere')
      await dialogue.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click(); await expect(dialogue.getByRole('checkbox')).not.toBeChecked()
      await dialogue.getByRole('checkbox').check(); await dialogue.getByRole('button', { name: 'Confirmer la suppression globale' }).click()
      await expect(dialogue).toHaveCount(0, { timeout: 30_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeSuppression: SondeSuppression }).sondeSuppression.publies)).toEqual(['e2', 'retrait'])
      expect((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu).toBe(acquis)
    } finally { await app.close().catch(() => undefined); await session.fermer(); shim.nettoyer(); if (mort) rmSync(profil, { recursive: true, force: true }) }
  })

})
