/**
 *  Consultation GitLab dans deux profils Electron isolés.
 *
 *  Le test est opt-in. Il amorce un corpus synthétique dans une racine unique,
 *  puis vérifie que deux comptes consultent le même contenu et peuvent ouvrir
 *  une session d'édition contrôlée.
 *  La fixture distante est conservée pour examen.
 *
 *  L'application se connecte par OAuth : le banc intercepte l'ouverture de
 *  l'URL d'autorisation et joue lui-même le consentement GitLab, comme la
 *  personne qui qualifie. Les jetons d'accès personnel ne servent plus qu'au
 *  harnais, qui sème et vérifie la fixture par l'API.
 */

import { expect, test, type Page, type ElectronApplication } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  corpusDistantValide,
  entretienDistantValide,
} from '../test/webdav/fixturesCorpusDistant'
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
import { ClientWebDAV } from '../src/main/webdav/client'
import { fixtureRenommageAnon } from '../test/fixtures/renommageAnon'
import { fixtureDissociationAnon } from '../test/fixtures/dissociationAnon'
import { ClientGitLab } from '../src/main/gitlab/client'
import { BailGitLab, DepotCommitsGitLabClient, cleRessourceBailGitLab, cheminBailRessourceGitLab } from '../src/main/gitlab/bailGitLab'

const configuration = {
  url: process.env.GITLAB_URL?.replace(/\/$/, ''),
  projetId: process.env.GITLAB_LFS_PROJECT_ID,
  projetSansLfsId: process.env.GITLAB_NO_LFS_PROJECT_ID,
  projetInterditId: process.env.GITLAB_FORBIDDEN_PROJECT_ID,
  token1: process.env.GITLAB_USER1_TOKEN,
  tokenSecondPoste: process.env.GITLAB_USER1_SECOND_TOKEN,
  token2: process.env.GITLAB_USER2_TOKEN,
  clientId: process.env.GITLAB_OAUTH_CLIENT_ID,
  utilisateur: process.env.GITLAB_OAUTH_USER1 ?? 'user1',
  motDePasse: process.env.GITLAB_OAUTH_PASSWORD1,
  motDePasse2: process.env.GITLAB_OAUTH_PASSWORD2,
  ca: process.env.GITLAB_CA,
}
// Le jeton du harnais sème et relit la fixture ; l'application, elle, ne
// connaît que l'identifiant public de l'application OAuth.
const configurationPresente = Boolean(
  configuration.url &&
  configuration.projetId &&
  configuration.token1 &&
  configuration.clientId &&
  configuration.motDePasse,
)
const tokenSecondPoste = configuration.token2 ?? configuration.tokenSecondPoste
const sansLfsConfigure = Boolean(configuration.projetSansLfsId && tokenSecondPoste)
const branche = 'main'
const idExecution = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const racine = `consultation-e2e-${idExecution}`
const idEntretien = 'entretien-consultation'
const titreEntretien = `Entretien GitLab ${idExecution}`
const texteEntretien = `Consultation GitLab de qualification ${idExecution}.`
const suffixeE2E = ` Modification ${idExecution}.`
const suffixeFermetureE2E = ` Fermeture ${idExecution}.`
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

async function teteBranche(
  jeton: string,
  projetId = configuration.projetId as string,
): Promise<string> {
  const brancheLue = await api<{ commit: { id: string } }>(
    `/projects/${projetId}/repository/branches/${encodeURIComponent(branche)}`,
    jeton,
  )
  return brancheLue.commit.id
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

async function amorcerConsultation(
  jeton: string,
  projetId = configuration.projetId as string,
  racineCourante = racine,
  mediaDistant?: string,
): Promise<void> {
  const corpus = JSON.parse(corpusDistantValide([idEntretien])) as {
    nom: string
    membership: Record<string, { titre: string }>
  }
  corpus.nom = `Consultation GitLab E2E ${idExecution}`
  corpus.membership[idEntretien].titre = titreEntretien
  const entretien = JSON.parse(entretienDistantValide({
    corpsTexte: {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { loc: null },
        content: [{ type: 'text', text: texteEntretien }],
      }],
    },
  })) as { meta: Record<string, unknown> }
  if (mediaDistant) {
    entretien.meta.audioDistant = { fournisseur: 'webdav', chemin: mediaDistant }
  }
  await api(
    `/projects/${projetId}/repository/commits`,
    jeton,
    {
      method: 'POST',
      body: JSON.stringify({
        branch: branche,
        commit_message: `E2E consultation Sonal ${idExecution}`,
        actions: [
          {
            action: 'create',
            file_path: `${racineCourante ? `${racineCourante}/` : ''}corpus.json`,
            content: Buffer.from(JSON.stringify(corpus)).toString('base64'),
            encoding: 'base64',
          },
          {
            action: 'create',
            file_path: `${racineCourante ? `${racineCourante}/` : ''}entretiens/${idEntretien}.json`,
            content: Buffer.from(JSON.stringify(entretien)).toString('base64'),
            encoding: 'base64',
          },
        ],
      }),
    },
  )
}

async function verifierBasculeLocalePuisGitLab(page: Page): Promise<void> {
  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await page.locator('.recent').last().click()
  await attendreCorpus(page)
  await expect(page.locator('.ajout-ent')).toBeVisible()

  await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
  await attendreAccueil(page)
  await page.locator('.recent').first().click()
  await attendreCorpus(page)
  await expect(page.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
}

async function expirerBailE2E(
  jeton: string,
  racineCourante: string,
  projetId = configuration.projetId as string,
): Promise<void> {
  const cheminEntretien = `${racineCourante}/entretiens/${idEntretien}.json`
  const resource = `branche:${branche}\u0000chemin:${cheminEntretien}`
  const resourceHash = createHash('sha256').update(resource).digest('hex')
  const cheminBail = `.sonal/verrous/${resourceHash}.json`
  const fichier = await api<{ content: string; last_commit_id: string }>(
    `/projects/${projetId}/repository/files/${encodeURIComponent(cheminBail)}?ref=${branche}`,
    jeton,
  )
  const bail = JSON.parse(Buffer.from(fichier.content, 'base64').toString('utf8')) as {
    expireLe: string
  }
  bail.expireLe = new Date(Date.now() - 1_000).toISOString()
  await api(
    `/projects/${projetId}/repository/commits`,
    jeton,
    {
      method: 'POST',
      body: JSON.stringify({
        branch: branche,
        commit_message: `E2E GitLab ${idExecution} : expiration du bail`,
        actions: [{
          action: 'update',
          file_path: cheminBail,
          content: Buffer.from(JSON.stringify(bail)).toString('base64'),
          encoding: 'base64',
          last_commit_id: fichier.last_commit_id,
        }],
      }),
    },
  )
}

async function ouvrirDestinationPourCrash(
  page: Page,
  interception: InterceptionOuvertureUrl,
  session: SessionQualification,
  racineCourante: string,
): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await ouvrirDepuisFormulaireGitLab(
    page,
    interception,
    session,
    identifiantsDe(configuration.utilisateur as string),
    racineCourante,
  )
  await attendreCorpus(page)
  await page.locator('.carte-ent .crayon').click()
  await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
}

async function consulterDansProfil(
  page: Page,
  interception: InterceptionOuvertureUrl,
  session: SessionQualification,
  projetId = configuration.projetId as string,
  modifier = false,
): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await ouvrirDepuisFormulaireGitLab(
    page,
    interception,
    session,
    identifiantsDe(configuration.utilisateur as string),
    racine,
    projetId,
  )

  await attendreCorpus(page)
  await expect(page.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
  await expect(page.locator('.ajout-ent')).toBeVisible()
  await page.locator('.carte-ent .crayon').click()
  await expect(page.locator('.editeur')).toContainText(texteEntretien)
  await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
  if (modifier) {
    await page.locator('.editeur').click()
    await page.keyboard.press('End')
    await page.keyboard.type(suffixeE2E)
    await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Publier maintenant' }).click()
    await expect(page.locator('.statut-session.publie')).toBeVisible({ timeout: 30_000 })
    await page.locator('.editeur').click()
    await page.keyboard.press('End')
    await page.keyboard.type(suffixeFermetureE2E)
    await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 10_000 })
  }

  await retourCorpus(page)
  await page.getByRole('button', { name: /Actualiser/ }).click()
  await expect(page.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
  await verifierBasculeLocalePuisGitLab(page)
}

type SondeDissociation = { mode: string; accepte: boolean; publies: string[] }
async function instrumenterDissociation(app: ElectronApplication, projet: number, mode = 'normal') {
  await app.evaluate((_electron, args) => {
    const g = globalThis as typeof globalThis & { sondeDissociation: SondeDissociation }
    const original = g.fetch
    g.sondeDissociation = { mode: args.mode, accepte: false, publies: [] }
    g.fetch = async (url, init) => {
      const adresse = new URL(url instanceof Request ? url.url : String(url)), s = g.sondeDissociation
      if (s.mode === 'perte-finale' && s.accepte && adresse.searchParams.has('search')) throw new Error('Historique synthétique indisponible')
      let phase = ''
      if (adresse.pathname === `/api/v4/projects/${args.projet}/repository/commits` && init?.method === 'POST') {
        const commit = JSON.parse(String(init.body))
        if (commit.commit_message.startsWith('Sonal dissociation-')) {
          const a = commit.actions.find((a: { action: string; file_path: string }) => a.action === 'update' && (a.file_path === 'corpus.json' || a.file_path.startsWith('entretiens/')))
          if (a.file_path === 'corpus.json') {
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
async function bancDissociation(suffixe: string) {
  test.skip(!configuration.token2, 'second compte GitLab du harnais absent')
  const projet = await api<{ id: number }>('/projects', configuration.token1 as string, { method: 'POST', body: JSON.stringify({ name: `Sonal dissociation ${suffixe} ${idExecution}`, path: `sonal-dissociation-${suffixe}-${idExecution}`, initialize_with_readme: true, default_branch: 'main', visibility: 'private' }) })
  const f = fixtureDissociationAnon()
  f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable synthétique', portee: 'locuteur', priv: false, ordre: 0, vExport: 0, modalites: [{ id: 'Valeur', lib: 'Valeur synthétique', mExport: 1 }] }
  await api(`/projects/${projet.id}/repository/commits`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ branch: 'main', commit_message: 'qualification : dissociation synthétique', actions: [
    { action: 'create', file_path: 'corpus.json', content: JSON.stringify(f.corpus) }, ...f.sources.map((s) => ({ action: 'create', file_path: `entretiens/${s.id}.json`, content: JSON.stringify(s.data) })),
  ] }) })
  const second = await api<{ id: number }>('/user', configuration.token2 as string)
  await api(`/projects/${projet.id}/members`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ user_id: second.id, access_level: 40 }) })
  await expect.poll(async () => { try { return (await api<{ can_push: boolean }>(`/projects/${projet.id}/repository/branches/main`, configuration.token2 as string)).can_push } catch { return false } }, { timeout: 90_000, intervals: [500, 1_000, 2_000, 5_000] }).toBe(true)
  const depot = new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: configuration.url as string, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: configuration.token1 as string } }))
  const bob = new BailGitLab({ branche: 'main', depot: new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: configuration.url as string, projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: configuration.token2 as string } })), identite: () => ({ userId: String(second.id), machineId: 'qualification-bob', sessionId: suffixe }) })
  return { projet, f, depot, bob }
}
async function ouvrirDissociation(page: Page) {
  await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
  await page.getByRole('button', { name: 'Dissocier globalement Karine', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })
  await modal.getByRole('button', { name: 'Préparer la dissociation globale', exact: true }).click()
  await expect(modal).toContainText('8 passage(s) concerné(s)', { timeout: 30_000 })
  return modal
}
async function rouvrirDissociation(page: Page, shim: InterceptionOuvertureUrl, session: SessionQualification) {
  await attendreAccueil(page); await page.locator('.recent').first().click()
  await expect(page.locator('.modale-distant')).toBeVisible()
  await consentirApresAction(page, shim, session, identifiantsDe(configuration.utilisateur as string), /^Se reconnecter et ouvrir$/)
  await attendreCorpus(page); await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
}

test.describe('Consultation GitLab à deux profils', () => {
  test.skip(!configurationPresente, 'variables GITLAB_* absentes')
  test.setTimeout(180_000)

  test('dissociation GitLab OAuth : annuler, cible tenue, nouveaux usages et consentement renouvelé', async ({ browser }, info) => {
    const b = await bancDissociation('partiel')
    const tenu = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e2.json'))
    if (!tenu.ok) throw new Error('Bail synthétique cible indisponible')
    const profil = mkdtempSync(join(tmpdir(), 'sonal-dissociation-oauth-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenterDissociation(app, b.projet.id)
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      let modal = await ouvrirDissociation(page)
      await expect(modal).toContainText('Sur GitLab, les entretiens sont mis à jour l’un après l’autre')
      await expect(modal.getByRole('button', { name: 'Confirmer la dissociation globale' })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('dissociation-gitlab-normale.png') })
      await page.setViewportSize({ width: 760, height: 700 }); await page.screenshot({ path: info.outputPath('dissociation-gitlab-reduite.png') })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.publies)).toEqual([])
      const consommation = await page.evaluate(async () => {
        const a = await window.sonal.corpus.apercuDissociationAnon({ regleId: 'personne' })
        a.definitionLocale.pseudos = ['Forgerie']
        let premier = '', second = ''
        try { await window.sonal.corpus.dissocierRegleAnon(a.token, false) } catch (e) { premier = String(e) }
        try { await window.sonal.corpus.dissocierRegleAnon(a.token, true) } catch (e) { second = String(e) }
        return { premier, second }
      })
      expect(consommation.premier).toContain('Confirmez'); expect(consommation.second).toContain('expiré')
      modal = await ouvrirDissociation(page); await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la dissociation globale' }).click()
      await expect(modal).toContainText('4 passage(s) mis à jour dans 1 entretien(s)', { timeout: 30_000 })
      await expect(modal.getByRole('checkbox')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('dissociation-gitlab-partielle.png') })
      const source = (await b.depot.lireFichier('entretiens/e3.json', 'main'))!
      b.f.sources[2].data.annotations = [structuredClone(b.f.sources[0].data.annotations[0])]
      await b.depot.publierCommit('main', 'qualification : nouvel usage hors protocole', [{ action: 'update', file_path: source.chemin, last_commit_id: source.commitId, content: JSON.stringify(b.f.sources[2].data) }])
      await b.bob.liberer(tenu.droit)
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('5 passage(s) concerné(s)', { timeout: 30_000 }); await expect(modal.getByRole('checkbox')).not.toBeChecked()
      await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la dissociation globale' }).click()
      await expect(modal).toHaveCount(0, { timeout: 30_000 })
      expect(JSON.parse((await b.depot.lireFichier('corpus.json', 'main'))!.contenu).reglesAnon.personne).toBeUndefined()
      for (const source of b.f.sources) {
        const actuel = JSON.parse((await b.depot.lireFichier(`entretiens/${source.id}.json`, 'main'))!.contenu)
        const attendu = structuredClone(source.data); attendu.lastModified = actuel.lastModified
        attendu.definitionsAnonLocales!.push({ entite: ['Karine'], pseudos: ['Claire', 'Rebecca'], categorie: 'PER', etat: 'declaration' })
        for (const a of attendu.annotations) if (a.regle === 'personne') delete a.regle
        expect(actuel).toEqual(attendu)
      }
      expect(await app.evaluate(() => (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.publies)).toEqual(['barriere', 'e1', 'e2', 'e3', 'retrait'])
    } finally { await Promise.allSettled([app.close(), session.fermer(), b.bob.liberer(tenu.droit)]); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('dissociation GitLab depuis l’entretien : enregistrement, fermeture, annulation puis mémoire locale', async ({ browser }) => {
    const b = await bancDissociation('portee'), profil = mkdtempSync(join(tmpdir(), 'sonal-dissociation-portee-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenterDissociation(app, b.projet.id)
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click()
      await expect(page.locator('.editeur')).toContainText('Rue Karine. Local.'); await page.locator('.editeur').press('Control+End'); await page.locator('.editeur').press('End'); await page.keyboard.insertText(' Ajout GitLab avant dissociation.')
      await page.locator('[data-onglet="anon"]').click()
      const bouton = page.locator('.ligne-anon.etat-corpus', { hasText: 'Karine' }).first().locator('.portee-cran').nth(1)
      await expect(bouton).toBeEnabled(); page.once('dialog', (d) => d.dismiss()); await bouton.click()
      await expect(page.locator('.editeur')).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })).toHaveCount(0)
      expect(JSON.parse((await b.depot.lireFichier('corpus.json', 'main'))!.contenu).dissociationAnon).toBeUndefined()
      expect((await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e1.json'))).ok).toBe(false)
      page.once('dialog', (d) => d.accept()); await bouton.click()
      const modal = page.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true }); await expect(modal).toBeVisible({ timeout: 30_000 })
      const avant = (await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu
      expect(avant).toContain('Ajout GitLab avant dissociation.'); expect(JSON.parse(avant).annotations.some((a: { regle?: string }) => a.regle === 'personne')).toBe(true)
      const libre = await b.bob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e1.json')); expect(libre.ok).toBe(true)
      if (!libre.ok) throw new Error('Session synthétique non fermée')
      await b.bob.liberer(libre.droit)
      await modal.getByRole('button', { name: 'Préparer la dissociation globale', exact: true }).click(); await expect(modal.getByRole('checkbox')).toBeEnabled({ timeout: 30_000 })
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click(); expect((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu).toBe(avant)
      const frais = await ouvrirDissociation(page); await frais.getByRole('checkbox').check(); await frais.getByRole('button', { name: 'Confirmer la dissociation globale' }).click(); await expect(frais).toHaveCount(0, { timeout: 30_000 })
      await page.locator('.onglets-corpus').getByRole('button', { name: 'Accueil', exact: true }).click(); await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click(); await page.locator('[data-onglet="anon"]').click()
      await expect(page.locator('.ligne-anon.etat-entretien', { hasText: 'Karine' }).first().locator('.pseudo-anon')).toHaveValue('Claire / Rebecca')
      const actuel = JSON.parse((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu); expect(actuel).toMatchObject({ corpsTexte: JSON.parse(avant).corpsTexte, locuteurs: b.f.sources[0].data.locuteurs })
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('dissociation GitLab OAuth : retrait accepté, réponse perdue et suivi sans rejeu', async ({ browser }, info) => {
    const b = await bancDissociation('retrait-incertain'), profil = mkdtempSync(join(tmpdir(), 'sonal-dissociation-suivi-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      await instrumenterDissociation(app, b.projet.id, 'perte-finale')
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      const modal = await ouvrirDissociation(page); await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la dissociation globale' }).click()
      await expect(modal).toContainText('Le serveur n’a pas confirmé le résultat', { timeout: 30_000 })
      await expect(modal.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeDisabled()
      await page.screenshot({ path: info.outputPath('dissociation-gitlab-indeterminee.png') })
      expect(JSON.parse((await b.depot.lireFichier('corpus.json', 'main'))!.contenu).reglesAnon.personne).toBeUndefined()
      await app.evaluate(() => { (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.mode = 'normal' })
      await modal.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
      await expect(modal).toHaveCount(0, { timeout: 30_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.publies)).toEqual(['barriere', 'e1', 'e2', 'retrait'])
    } finally { await app.close(); await session.fermer(); shim.nettoyer(); rmSync(profil, { recursive: true, force: true }) }
  })
  test('dissociation GitLab OAuth : SIGKILL après transfert accepté, bail persistant refusé puis reprise restante', async ({ browser }, info) => {
    const b = await bancDissociation('sigkill'), profil = mkdtempSync(join(tmpdir(), 'sonal-dissociation-kill-')), shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    let app = await lancerProfil(profil, shim), mort = false
    try {
      await instrumenterDissociation(app, b.projet.id, 'kill')
      const page = await app.firstWindow(); await attendreAccueil(page); await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(b.projet.id)); await attendreCorpus(page)
      const modal = await ouvrirDissociation(page); await modal.getByRole('checkbox').check(); await modal.getByRole('button', { name: 'Confirmer la dissociation globale' }).click()
      await expect.poll(() => app.evaluate(() => (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.accepte), { timeout: 30_000 }).toBe(true)
      const cheminBail = cheminBailRessourceGitLab(cleRessourceBailGitLab('main', 'corpus.json'))
      const bailAvant = JSON.parse((await b.depot.lireFichier(cheminBail, 'main'))!.contenu)
      const acquis = (await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu
      const processus = app.process(), sortie = new Promise<void>((resolve) => processus.once('exit', () => resolve()))
      expect(processus.kill('SIGKILL')).toBe(true); await sortie; mort = true
      expect(processus.signalCode).toBe('SIGKILL')
      app = await lancerProfil(profil, shim, true); await instrumenterDissociation(app, b.projet.id)
      const reprise = await app.firstWindow(); await rouvrirDissociation(reprise, shim, session)
      await expect(reprise.getByText('Lot GitLab de dissociation à reprendre', { exact: true })).toBeVisible()
      await reprise.getByRole('button', { name: 'Relire le suivi GitLab', exact: true }).click()
      await expect(reprise.getByRole('button', { name: 'Recalculer la reprise', exact: true })).toBeEnabled({ timeout: 30_000 })
      await reprise.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      const dialogue = reprise.getByRole('dialog', { name: 'Dissocier une règle du corpus', exact: true })
      await dialogue.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(dialogue).toContainText('4 passage(s) concerné(s)', { timeout: 30_000 })
      await dialogue.getByRole('checkbox').check(); await dialogue.getByRole('button', { name: 'Confirmer la dissociation globale' }).click()
      await expect(dialogue).toContainText('La ressource est tenue par un autre poste', { timeout: 30_000 })
      await expect(dialogue.getByRole('button', { name: 'Annuler', exact: true })).toBeEnabled()
      expect(await app.evaluate(() => (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.publies)).toEqual([])
      await reprise.screenshot({ path: info.outputPath('dissociation-gitlab-bail-persistant.png') })
      expect((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu).toBe(acquis)
      const actuel = JSON.parse((await b.depot.lireFichier(cheminBail, 'main'))!.contenu)
      expect(actuel.generation).toBe(bailAvant.generation)
      // Seul le banc intervient, après preuve de mort du processus synthétique.
      expect(mort).toBe(true)
      const compte = await api<{ id: number; username: string }>('/user', configuration.token1 as string)
      expect([String(compte.id), compte.username]).toContain(bailAvant.holder.userId)
      const externe = new BailGitLab({ branche: 'main', depot: b.depot, identite: () => ({ userId: bailAvant.holder.userId, machineId: 'fixture', sessionId: 'preuve-mort' }) })
      expect(await externe.rendreBailNotre(cheminBail, bailAvant.generation)).toBe('libere')
      await dialogue.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click(); await expect(dialogue.getByRole('checkbox')).not.toBeChecked()
      await dialogue.getByRole('checkbox').check(); await dialogue.getByRole('button', { name: 'Confirmer la dissociation globale' }).click()
      await expect(dialogue).toHaveCount(0, { timeout: 30_000 })
      expect(await app.evaluate(() => (globalThis as unknown as { sondeDissociation: SondeDissociation }).sondeDissociation.publies)).toEqual(['e2', 'retrait'])
      expect((await b.depot.lireFichier('entretiens/e1.json', 'main'))!.contenu).toBe(acquis)
    } finally { await app.close().catch(() => undefined); await session.fermer(); shim.nettoyer(); if (mort) rmSync(profil, { recursive: true, force: true }) }
  })
  test('renommage ciblé GitLab : inventaire publié, cible tenue, reprise confirmée sans toucher les locuteurs', async ({ browser }, testInfo) => {
    test.skip(!configuration.token2, 'second compte GitLab du harnais absent')
    const projet = await api<{ id: number }>('/projects', configuration.token1 as string, {
      method: 'POST', body: JSON.stringify({ name: `Sonal renommage E2E ${idExecution}`, path: `sonal-renommage-e2e-${idExecution}`, initialize_with_readme: true, default_branch: 'main', visibility: 'private' }),
    })
    const f = fixtureRenommageAnon(['e1', 'e2', 'e3']); f.sources[2].data.annotations = []
    f.corpus.variables.modalite = { id: 'modalite', lib: 'Variable synthétique', portee: 'locuteur', priv: false, ordre: 0, vExport: 0,
      modalites: [{ id: 'Valeur', lib: 'Valeur synthétique', mExport: 1 }] }
    await api(`/projects/${projet.id}/repository/commits`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ branch: 'main', commit_message: 'qualification : corpus synthétique du renommage', actions: [
      { action: 'create', file_path: 'corpus.json', content: JSON.stringify(f.corpus) }, ...f.sources.map((s) => ({ action: 'create', file_path: `entretiens/${s.id}.json`, content: JSON.stringify(s.data) })),
    ] }) })
    const secondCompte = await api<{ id: number }>('/user', configuration.token2 as string)
    await api(`/projects/${projet.id}/members`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ user_id: secondCompte.id, access_level: 40 }) })
    await expect.poll(async () => {
      try { return (await api<{ can_push: boolean }>(`/projects/${projet.id}/repository/branches/main`, configuration.token2 as string)).can_push }
      catch { return false }
    }, { message: 'Le second compte doit pouvoir publier sur la branche synthétique.', timeout: 90_000, intervals: [500, 1_000, 2_000, 5_000] }).toBe(true)
    const coordinationBob = new BailGitLab({ branche: 'main', depot: new DepotCommitsGitLabClient(new ClientGitLab({ urlInstance: configuration.url as string,
      projetId: projet.id, autorisation: { type: 'jeton-prive', jeton: configuration.token2 as string } })),
      identite: () => ({ userId: String(secondCompte.id), machineId: 'qualification-bob', sessionId: `renommage-${idExecution}` }) })
    const bailCible = await coordinationBob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e2.json'))
    const bailNonCible = await coordinationBob.acquireRessource(cleRessourceBailGitLab('main', 'entretiens/e3.json'))
    if (!bailCible.ok || !bailNonCible.ok) throw new Error('Baux synthétiques de qualification indisponibles.')
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-renommage-'))
    const shim = intercepterOuvertureUrl(), session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      const page = await app.firstWindow(); await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(projet.id))
      await attendreCorpus(page)
      await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      const bouton = page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })
      await expect(bouton).toBeEnabled()
      const ouvrirRenommage = async () => {
        await bouton.click()
        const edition = page.getByRole('dialog', { name: 'Modifier les pseudonymes', exact: true })
        await edition.getByLabel('Pseudonymes', { exact: true }).fill('Nouvelle / Rebecca')
        await edition.getByRole('button', { name: 'Enregistrer', exact: true }).click()
      }
      const chemin = 'entretiens/e2.json'
      const source = await api<{ last_commit_id: string }>(`/projects/${projet.id}/repository/files/${encodeURIComponent(chemin)}?ref=main`, configuration.token1 as string)
      f.sources[1].data.annotations[0].pseudo = 'Rebecca'
      await api(`/projects/${projet.id}/repository/commits`, configuration.token1 as string, { method: 'POST', body: JSON.stringify({ branch: 'main', commit_message: 'qualification : choix publié après ouverture du miroir', actions: [{ action: 'update', file_path: chemin, last_commit_id: source.last_commit_id, content: JSON.stringify(f.sources[1].data) }] }) })
      await ouvrirRenommage()
      let modal = page.getByRole('dialog', { name: 'Renommer une variante corpus' })
      await modal.getByLabel('Nouveau pseudonyme').fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire' }).click()
      await expect(modal).toContainText('3 annotation(s) à renommer, dont 2 masquée(s)')
      await expect(modal).toContainText('Cet inventaire lit un commit publié, jamais le miroir')
      await modal.getByRole('button', { name: 'Annuler', exact: true }).click()
      let commits = await api<Array<{ title: string }>>(`/projects/${projet.id}/repository/commits?ref_name=main&per_page=100`, configuration.token1 as string)
      expect(commits.filter((c) => c.title.startsWith('Sonal renommage-'))).toHaveLength(0)
      await ouvrirRenommage(); modal = page.getByRole('dialog', { name: 'Renommer une variante corpus' })
      await modal.getByLabel('Nouveau pseudonyme').fill('Nouvelle')
      await modal.getByRole('button', { name: 'Préparer l’inventaire' }).click()
      await expect(modal).toContainText('3 annotation(s) à renommer')
      await expect(modal.getByRole('button', { name: 'Confirmer le renommage global' })).toBeDisabled()
      await page.screenshot({ path: testInfo.outputPath('renommage-gitlab-normal.png') })
      await page.setViewportSize({ width: 760, height: 700 })
      await page.screenshot({ path: testInfo.outputPath('renommage-gitlab-reduit.png') })
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer le renommage global' }).click()
      await expect(modal).toContainText('Lot GitLab à reprendre', { timeout: 30_000 })
      await expect(modal).toContainText('2 annotation(s) publiée(s) dans 1 entretien(s)')
      await expect(modal).toContainText('tenue par un autre poste')
      await expect(modal.getByRole('checkbox')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('renommage-gitlab-partiel.png') })
      await coordinationBob.liberer(bailCible.droit)
      await modal.getByRole('button', { name: 'Recalculer la reprise', exact: true }).click()
      await expect(modal).toContainText('1 annotation(s) à renommer, dont 1 masquée(s)')
      await expect(modal.getByRole('button', { name: 'Confirmer le renommage global' })).toBeDisabled()
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Confirmer le renommage global' }).click()
      await expect(modal).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Modifier les pseudonymes de Karine', exact: true })).toHaveText('Nouvelle / Rebecca')
      for (const s of f.sources) {
        const fichier = await api<{ content: string }>(`/projects/${projet.id}/repository/files/${encodeURIComponent(`entretiens/${s.id}.json`)}?ref=main`, configuration.token1 as string)
        const apres = JSON.parse(Buffer.from(fichier.content, 'base64').toString('utf8'))
        const attendu = structuredClone(s.data)
        if (s.id !== 'e3') { attendu.lastModified = apres.lastModified; for (const a of attendu.annotations) if (a.regle === 'personne' && a.etat !== 'exception' && a.pseudo === 'Claire') a.pseudo = 'Nouvelle' }
        expect(apres).toEqual(attendu)
      }
      commits = await api<Array<{ title: string }>>(`/projects/${projet.id}/repository/commits?ref_name=main&per_page=100`, configuration.token1 as string)
      expect(commits.filter((c) => c.title.startsWith('Sonal renommage-'))).toHaveLength(3)
      await page.getByRole('navigation', { name: 'Navigation du corpus' }).getByRole('button', { name: 'Accueil', exact: true }).click()
      await page.locator('.carte-ent', { hasText: 'Entretien e1' }).locator('.crayon').click()
      await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
      await expect(page.locator('.editeur')).toContainText('Rue Karine. Local.')
      await page.locator('.editeur').press('Control+End'); await page.locator('.editeur').press('End'); await page.keyboard.insertText(' Ajout de qualification.')
      await expect(page.locator('.editeur')).toContainText('Ajout de qualification.')
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: 'Publier maintenant', exact: true }).click()
      await expect(page.locator('.statut-session.publie')).toBeVisible({ timeout: 30_000 })
      await retourCorpus(page)
    } finally {
      await Promise.allSettled([app.close(), session.fermer(), coordinationBob.liberer(bailCible.droit), coordinationBob.liberer(bailNonCible.droit)])
      shim.nettoyer(); rmSync(profil, { recursive: true, force: true })
    }
  })

  test('import ciblé GitLab : aperçu publié, confirmation et déclaration sans occurrence', async ({ browser }) => {
    const projet = await api<{ id: number }>('/projects', configuration.token1 as string, {
      method: 'POST', body: JSON.stringify({ name: `Sonal correspondances E2E ${idExecution}`, path: `sonal-correspondances-e2e-${idExecution}`, initialize_with_readme: true, default_branch: 'main', visibility: 'private' }),
    })
    await amorcerConsultation(configuration.token1 as string, String(projet.id), '')
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-correspondances-'))
    const shim = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(page, shim, session, identifiantsDe(configuration.utilisateur as string), '', String(projet.id))
      await attendreCorpus(page)
      await page.getByRole('button', { name: 'Pseudonymisation', exact: true }).click()
      await page.getByRole('button', { name: 'Import règles', exact: true }).click()
      const modal = page.getByRole('dialog', { name: 'Importer les correspondances', exact: true })
      await modal.getByLabel('Fichiers JSON').setInputFiles({ name: 'locales.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        format: 'sonalpi-correspondances', version: 2, correspondances: [{ nature: 'texte', portee: 'texte-local', entite: ['Alias sans occurrence', 'Autre graphie'], pseudos: ['Lieu témoin'], categorie: 'LOC', etatLocal: 'declaration' }],
      })) })
      await expect(modal).toContainText('L’aperçu lit un commit publié de GitLab')
      const cible = modal.locator('table').nth(1).locator('tbody tr')
      await expect(cible).toHaveCount(1)
      const confirmer = modal.getByRole('button', { name: /Confirmer l’import/ })
      await expect(confirmer).toBeDisabled()
      await cible.getByRole('checkbox').check()
      await modal.getByLabel('Je confirme ces seuls entretiens et décisions.', { exact: false }).check()
      await confirmer.click()
      await expect(modal).not.toBeVisible()
      const fichier = await api<{ content: string }>(`/projects/${projet.id}/repository/files/${encodeURIComponent(`entretiens/${idEntretien}.json`)}?ref=main`, configuration.token1 as string)
      const apres = JSON.parse(Buffer.from(fichier.content, 'base64').toString('utf8'))
      expect(apres.definitionsAnonLocales[0]).toMatchObject({ entite: ['Alias sans occurrence', 'Autre graphie'], pseudos: ['Lieu témoin'], categorie: 'LOC' })
      expect(apres.corpsTexte.content[0].content[0].text).toBe(texteEntretien)
    } finally {
      await Promise.allSettled([app.close(), session.fermer()])
      shim.nettoyer()
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un véritable lecteur audio lit et cherche par plages dans la base WebDAV', async ({ browser }) => {
    test.setTimeout(300_000)
    const urlWebDAV = 'http://localhost:8080/remote.php/dav/files/max/MonCorpus'
    const identifiantsWebDAV = { utilisateur: 'max', motDePasse: 'max-max-1234' }
    const serveurDisponible = await fetch('http://localhost:8080/status.php', {
      signal: AbortSignal.timeout(800),
    }).then((reponse) => reponse.ok).catch(() => false)
    test.skip(!serveurDisponible, 'pile Nextcloud absente')

    const cheminMedia = `audio-gitlab-${idExecution}.mp3`
    const racineMedia = `${racine}-media`
    const clientMedia = new ClientWebDAV({ baseUrl: urlWebDAV, identifiants: identifiantsWebDAV })
    const octets = new Uint8Array(readFileSync(join(process.cwd(), 'CorpusTest/CorpusSynth/audio/1Coordinatrice.mp3')))
    await clientMedia.putBinaire(cheminMedia, octets, { contentType: 'audio/mpeg' })
    await amorcerConsultation(
      configuration.token1 as string,
      configuration.projetId as string,
      racineMedia,
      cheminMedia,
    )

    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-media-'))
    const shim = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(
        page,
        shim,
        session,
        identifiantsDe(configuration.utilisateur as string),
        racineMedia,
      )
      await attendreCorpus(page)

      await page.locator('.fil .lien-nav', { hasText: 'Accueil' }).click()
      await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      await page.getByRole('tab', { name: 'GitLab' }).click()
      const destinationGitLab = page.locator('.comptes li', { hasText: racineMedia }).first()
      await destinationGitLab.getByRole('button', { name: 'Médias…' }).click()
      const formulaire = destinationGitLab.locator('.base-media-form')
      await formulaire.locator('input[type=text]').nth(0).fill(urlWebDAV)
      await formulaire.locator('input[type=text]').nth(1).fill(identifiantsWebDAV.utilisateur)
      await formulaire.locator('input[type=password]').fill(identifiantsWebDAV.motDePasse)
      await formulaire.getByRole('button', { name: 'Enregistrer' }).click()
      await expect(destinationGitLab.locator('.base-media-etat')).toContainText('max')
      await destinationGitLab.getByRole('button', { name: /^Ouvrir$/ }).click()
      await attendreCorpus(page)

      await page.locator('.carte-ent .crayon').click()
      const actionLecture = page.getByRole('button', { name: 'Lire depuis le serveur' })
      await expect(actionLecture).toBeVisible({ timeout: 20_000 })
      await actionLecture.click()
      const audio = page.locator('audio[data-sonal]')
      await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.duration), {
        timeout: 30_000,
      }).toBeGreaterThan(2)

      await page.locator('button.play').click()
      await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime), {
        timeout: 20_000,
      }).toBeGreaterThan(0.2)
      const duree = await audio.evaluate((element: HTMLAudioElement) => element.duration)
      for (const ratio of [0.65, 0.2, 0.8]) {
        await audio.evaluate((element: HTMLAudioElement, temps) => {
          element.currentTime = temps
        }, duree * ratio)
        await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime))
          .toBeGreaterThan(duree * ratio - 0.5)
      }

      const ancienneUrl = await audio.evaluate((element: HTMLAudioElement) => element.currentSrc)
      await clientMedia.putBinaire(cheminMedia, octets, { contentType: 'audio/mpeg' })
      const urlVerification = `${ancienneUrl}?verification=${Date.now()}`
      await audio.evaluate((element: HTMLAudioElement, url) => {
        element.src = url
        element.load()
      }, urlVerification)
      await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentSrc), {
        timeout: 30_000,
      }).not.toBe(urlVerification)
      expect(await audio.evaluate((element: HTMLAudioElement) => element.currentSrc))
        .not.toBe(ancienneUrl)
      await expect(page.locator('.editeur')).toBeVisible()
    } finally {
      await Promise.allSettled([app.close(), session.fermer()])
      shim.nettoyer()
      rmSync(profil, { recursive: true, force: true })
      await clientMedia.supprimer(cheminMedia).catch(() => undefined)
    }
  })

  test('deux postes isolés consultent le même contenu et ouvrent une session contrôlée', async ({ browser }) => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const jetonEcriture = configuration.token1 as string
    await amorcerConsultation(jetonEcriture)
    const teteInitiale = await teteBranche(jetonEcriture)
    const profil1 = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-1-'))
    const profil2 = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-2-'))
    const shim1 = intercepterOuvertureUrl()
    const shim2 = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    let app1 = await lancerProfil(profil1, shim1)
    const app2 = await lancerProfil(profil2, shim2)

    try {
      await consulterDansProfil(
        await app1.firstWindow(),
        shim1,
        session,
        configuration.projetId as string,
        true,
      )
      await consulterDansProfil(await app2.firstWindow(), shim2, session)

      const miroirs1 = readdirSync(join(profil1, 'miroirs'))
      const miroirs2 = readdirSync(join(profil2, 'miroirs'))
      expect(miroirs1).toHaveLength(1)
      expect(miroirs2).toHaveLength(1)
      expect(miroirs1[0]).toBe(miroirs2[0])
      expect(join(profil1, 'miroirs', miroirs1[0])).not.toBe(
        join(profil2, 'miroirs', miroirs2[0]),
      )

      await app1.close()
      // Le profil conserve la destination.
      // Sans coffre sécurisé, une nouvelle connexion OAuth suit le redémarrage.
      app1 = await lancerProfil(profil1, shim1, true)
      const pageRedemarrée = await app1.firstWindow()
      await attendreAccueil(pageRedemarrée)
      await pageRedemarrée.locator('.recent').first().click()
      await expect(pageRedemarrée.locator('.modale-distant')).toBeVisible()
      await consentirApresAction(
        pageRedemarrée,
        shim1,
        session,
        identifiantsDe(configuration.utilisateur as string),
        /^Se reconnecter et ouvrir$/,
      )
      await attendreCorpus(pageRedemarrée)
      await expect(pageRedemarrée.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
      await pageRedemarrée.locator('.carte-ent .crayon').click()
      await expect(pageRedemarrée.locator('.editeur')).toContainText(suffixeFermetureE2E)
      await retourCorpus(pageRedemarrée)
      expect(readdirSync(join(profil1, 'miroirs'))).toEqual(miroirs1)
      expect(await teteBranche(jetonEcriture)).not.toBe(teteInitiale)
    } finally {
      await Promise.allSettled([app1.close(), app2.close(), session.fermer()])
      shim1.nettoyer()
      shim2.nettoyer()
      rmSync(profil1, { recursive: true, force: true })
      rmSync(profil2, { recursive: true, force: true })
    }
  })

  test('le bouton de création crée un corpus GitLab dans un projet existant', async ({ browser }) => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const racineCreation = `${racine}-creation-${Date.now().toString(36)}`
    const nomCreation = `Corpus créé ${idExecution}`
    const projet = await api<{ path_with_namespace: string }>(
      `/projects/${configuration.projetId}`,
      configuration.token1 as string,
    )
    const urlProjet = `${(configuration.url as string).replace(/\/$/, '')}/${projet.path_with_namespace}`
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-creation-'))
    const shim = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.nouveau-corpus-distant').click()
      await remplirAccesGitLab(
        page,
        configuration.projetId as string,
        racineCreation,
      )
      await page.locator('.url-projet-gitlab').fill(urlProjet)
      await page.locator('.champ-nom').fill(nomCreation)
      await consentirApresAction(
        page,
        shim,
        session,
        identifiantsDe(configuration.utilisateur as string),
        /^Créer le corpus et l’ouvrir$/,
      )
      await attendreCorpus(page)
      const corpusCree = await api<{ content: string }>(
        `/projects/${configuration.projetId}/repository/files/${encodeURIComponent(`${racineCreation}/corpus.json`)}?ref=${branche}`,
        configuration.token1 as string,
      )
      expect(Buffer.from(corpusCree.content, 'base64').toString('utf8')).toContain(
        `"nom": "${nomCreation}"`,
      )
    } finally {
      await app.close().catch(() => undefined)
      await session.fermer().catch(() => undefined)
      shim.nettoyer()
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un crash conserve une autosave et protège sa reprise', async ({ browser }) => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const racineCrash = `${racine}-crash-${Date.now().toString(36)}`
    const jeton = configuration.token1 as string
    await amorcerConsultation(jeton, configuration.projetId as string, racineCrash)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-crash-'))
    const shim = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    let app = await lancerProfil(profil, shim)
    try {
      const page = await app.firstWindow()
      await ouvrirDestinationPourCrash(page, shim, session, racineCrash)
      const suffixe = ` Autosave crash ${idExecution}.`
      await page.locator('.editeur').click()
      await page.keyboard.press('End')
      await page.keyboard.type(suffixe)
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 10_000 })
      app.process()?.kill('SIGKILL')
      await new Promise((resolve) => setTimeout(resolve, 1_000))

      app = await lancerProfil(profil, shim, true)
      const pageRedemarree = await app.firstWindow()
      await attendreAccueil(pageRedemarree)
      await pageRedemarree.locator('.recent').first().click()
      await expect(pageRedemarree.locator('.modale-distant')).toBeVisible()
      await consentirApresAction(
        pageRedemarree,
        shim,
        session,
        identifiantsDe(configuration.utilisateur as string),
        /^Se reconnecter et ouvrir$/,
      )
      await attendreCorpus(pageRedemarree)
      await pageRedemarree.locator('.carte-ent .crayon').click()
      await expect(pageRedemarree.locator('.editeur')).toContainText(suffixe.trim())
      await expect(pageRedemarree.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    } finally {
      await app.close().catch(() => undefined)
      await session.fermer().catch(() => undefined)
      shim.nettoyer()
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un second profil est exclu puis reprend après expiration du bail', async ({ browser }) => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const racineReprise = `${racine}-reprise-${Date.now().toString(36)}`
    test.skip(!configuration.motDePasse2, 'identifiants OAuth du second compte absents')
    const jetonA = configuration.token1 as string
    await amorcerConsultation(jetonA, configuration.projetId as string, racineReprise)
    const profilA = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-reprise-a-'))
    const profilB = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-reprise-b-'))
    const shimA = intercepterOuvertureUrl()
    const shimB = intercepterOuvertureUrl()
    const sessionA = await sessionQualification(browser, Boolean(configuration.ca))
    const sessionB = await sessionQualification(browser, Boolean(configuration.ca))
    let appA = await lancerProfil(profilA, shimA)
    let appB = await lancerProfil(profilB, shimB)
    try {
      const pageA = await appA.firstWindow()
      await ouvrirDestinationPourCrash(pageA, shimA, sessionA, racineReprise)
      await pageA.locator('.editeur').click()
      await pageA.keyboard.press('End')
      await pageA.keyboard.type(` Ancien poste ${idExecution}.`)
      await expect(pageA.locator('.statut-session.sale')).toBeVisible({ timeout: 10_000 })
      await appA.evaluate(({ powerMonitor }) => powerMonitor.emit('suspend'))
      await expect(pageA.locator('.editeur')).toContainText(`Ancien poste ${idExecution}.`)
      await pageA.waitForTimeout(1_000)
      await appA.evaluate(({ powerMonitor }) => powerMonitor.emit('resume'))
      await expect(pageA.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
      await pageA.waitForTimeout(1_000)

      const pageB = await appB.firstWindow()
      // Second compte sur la même instance : sa propre connexion OAuth.
      await attendreAccueil(pageB)
      await pageB.locator('.carte-demo.distant-corpus').click()
      await ouvrirDepuisFormulaireGitLab(
        pageB,
        shimB,
        sessionB,
        identifiantsDe(process.env.GITLAB_OAUTH_USER2 ?? 'user2'),
        racineReprise,
      )
      await attendreCorpus(pageB)
      // Le bail du premier poste est vif : le second voit qui tient l'entretien,
      // et l'ouverture en lecture seule reste proposée. L'observation ayant
      // abouti, aucune mention d'indisponibilité n'est affichée.
      await expect(pageB.locator('.verrous-indispo')).toHaveCount(0)
      await expect(pageB.locator('.badge-verrou').first())
        .toContainText(configuration.utilisateur as string)
      await pageB.locator('.carte-ent .crayon').click()
      await expect(pageB.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
      await expect(pageB.locator('.banniere-ro')).toContainText(configuration.utilisateur as string)

      await expirerBailE2E(jetonA, racineReprise)
      // Le bail expiré ne badge plus, et son absence ne prouve rien :
      // l'ouverture tente l'acquisition et réussit.
      await retourCorpus(pageB)
      await pageB.getByRole('button', { name: /Actualiser/ }).click()
      await expect(pageB.locator('.badge-verrou')).toHaveCount(0)
      await pageB.locator('.carte-ent .crayon').click()
      await expect(pageB.locator('.editeur')).toHaveAttribute('contenteditable', 'true')

      await pageA.getByRole('button', { name: 'Publier maintenant' }).click()
      await expect(pageA.locator('.statut-session.divergence')).toContainText(
        /Droit d’édition perdu|Le serveur a changé/,
      )
      await expect(pageA.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
      await expect(pageA.locator('.editeur')).toContainText(`Ancien poste ${idExecution}.`)
      await expect(pageB.locator('.editeur')).not.toContainText(`Ancien poste ${idExecution}.`)
    } finally {
      await Promise.allSettled([
        appA.close(), appB.close(), sessionA.fermer(), sessionB.fermer(),
      ])
      shimA.nettoyer()
      shimB.nettoyer()
      rmSync(profilA, { recursive: true, force: true })
      rmSync(profilB, { recursive: true, force: true })
    }
  })

  test('un projet interdit est refusé sans créer de miroir ni modifier le projet', async ({ browser }) => {
    test.skip(
      !configuration.projetInterditId || !configuration.token2,
      'projet interdit ou jeton du compte autorisé absent',
    )
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const projetInterdit = configuration.projetInterditId as string
    const jetonAutorise = configuration.token2 as string
    const teteInitiale = await teteBranche(jetonAutorise, projetInterdit)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-refus-'))
    const interception = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, interception)

    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      // Connexion réelle, puis tentative sur un projet que le compte ne voit pas :
      // le refus porte sur le projet, jamais sur la connexion.
      await ouvrirDepuisFormulaireGitLab(
        page,
        interception,
        session,
        identifiantsDe(configuration.utilisateur as string),
        racine,
        projetInterdit,
        jetonAutorise,
      )
      await expect(page.locator('.modale-distant .msg')).toContainText(/introuvable|inaccessible/i)
      expect(existsSync(join(profil, 'miroirs'))).toBe(false)
      expect(await teteBranche(jetonAutorise, projetInterdit)).toBe(teteInitiale)
    } finally {
      await app.close()
      await session.fermer().catch(() => undefined)
      interception.nettoyer()
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un projet sans LFS reste consultable pour ses transcriptions', async ({ browser }) => {
    test.skip(!sansLfsConfigure, 'aucun projet sans LFS configuré')
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const projetSansLfs = configuration.projetSansLfsId as string
    const jeton = tokenSecondPoste as string
    await amorcerConsultation(jeton, projetSansLfs)
    const teteInitiale = await teteBranche(jeton, projetSansLfs)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-sans-lfs-'))
    const shim = intercepterOuvertureUrl()
    const session = await sessionQualification(browser, Boolean(configuration.ca))
    const app = await lancerProfil(profil, shim)

    try {
      await consulterDansProfil(await app.firstWindow(), shim, session, projetSansLfs)
      expect(await teteBranche(jeton, projetSansLfs)).not.toBe(teteInitiale)
    } finally {
      await app.close()
      await session.fermer().catch(() => undefined)
      shim.nettoyer()
      rmSync(profil, { recursive: true, force: true })
    }
  })
})
