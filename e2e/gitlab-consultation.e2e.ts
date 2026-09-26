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

import { expect, test, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
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
import { attendreAccueil, attendreCorpus, lancer, retourCorpus } from './util'

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
  await page.getByRole('tab', { name: 'GitLab' }).click()
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
  })) as unknown
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
            file_path: `${racineCourante}/corpus.json`,
            content: Buffer.from(JSON.stringify(corpus)).toString('base64'),
            encoding: 'base64',
          },
          {
            action: 'create',
            file_path: `${racineCourante}/entretiens/${idEntretien}.json`,
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

test.describe('Consultation GitLab à deux profils', () => {
  test.skip(!configurationPresente, 'variables GITLAB_* absentes')
  test.setTimeout(180_000)

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

  test('un second profil reprend après expiration et l’ancien poste est refusé', async ({ browser }) => {
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
      await expirerBailE2E(jetonA, racineReprise)

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
