/**
 *  Consultation GitLab dans deux profils Electron isolés.
 *
 *  Le test est opt-in. Il amorce un corpus synthétique dans une racine unique,
 *  puis vérifie que deux comptes consultent le même contenu et peuvent ouvrir
 *  une session d'édition contrôlée.
 *  La fixture distante est conservée pour examen.
 */

import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  corpusDistantValide,
  entretienDistantValide,
} from '../test/webdav/fixturesCorpusDistant'
import { attendreAccueil, attendreCorpus, lancer, retourCorpus } from './util'

const configuration = {
  url: process.env.GITLAB_URL?.replace(/\/$/, ''),
  projetId: process.env.GITLAB_LFS_PROJECT_ID,
  projetSansLfsId: process.env.GITLAB_NO_LFS_PROJECT_ID,
  token1: process.env.GITLAB_USER1_TOKEN,
  tokenSecondPoste: process.env.GITLAB_USER1_SECOND_TOKEN,
  token2: process.env.GITLAB_USER2_TOKEN,
}
const configurationPresente = Boolean(
  configuration.url && configuration.projetId && configuration.token1 && configuration.tokenSecondPoste,
)
const tokenSecondPoste = configuration.token2 ?? configuration.tokenSecondPoste
const sansLfsConfigure = Boolean(configuration.projetSansLfsId)
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

function lancerProfil(userDataDir: string, preserverSettings = false) {
  return lancer(userDataDir, { preserverSettings, executablePath: executableEmpaquete })
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

async function ouvrirDestinationPourCrash(
  page: Page,
  utilisateur: string,
  jeton: string,
  racineCourante: string,
  projetId = configuration.projetId as string,
): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab' }).click()
  await page.locator('.url-gitlab').fill(configuration.url as string)
  await page.locator('.utilisateur-gitlab').fill(utilisateur)
  await page.locator('.jeton-gitlab').fill(jeton)
  await page.getByRole('button', { name: 'Découvrir les projets' }).click()
  await page.locator('.projet-gitlab').selectOption(projetId)
  await page.locator('.racine-gitlab').fill(racineCourante)
  await page.getByRole('button', { name: 'Ouvrir depuis GitLab' }).click()
  await attendreCorpus(page)
  await page.locator('.carte-ent .crayon').click()
  await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
}

async function consulterDansProfil(
  page: Page,
  utilisateur: string,
  jeton: string,
  projetId = configuration.projetId as string,
  modifier = false,
): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
  await page.getByRole('tab', { name: 'GitLab' }).click()
  await page.locator('.url-gitlab').fill(configuration.url as string)
  await page.locator('.utilisateur-gitlab').fill(utilisateur)
  await page.locator('.jeton-gitlab').fill(jeton)
  await page.getByRole('button', { name: 'Découvrir les projets' }).click()
  const selecteurProjet = page.locator('.projet-gitlab')
  await expect(selecteurProjet.locator('option')).not.toHaveCount(1)
  await selecteurProjet.selectOption(projetId)
  const selecteurBranche = page.locator('.branche-gitlab')
  await expect(selecteurBranche).toHaveValue(branche)
  await page.locator('.racine-gitlab').fill(racine)
  await page.getByRole('button', { name: 'Ouvrir depuis GitLab' }).click()

  await attendreCorpus(page)
  await expect(page.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
  await expect(page.locator('.ajout-ent')).toHaveCount(0)
  await page.locator('.carte-ent .crayon').click()
  await expect(page.locator('.editeur')).toContainText(texteEntretien)
  await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'true')
  if (modifier) {
    await page.locator('.editeur').click()
    await page.keyboard.press('End')
    await page.keyboard.type(suffixeE2E)
    await expect(page.locator('.statut-session.sale')).toBeVisible()
    await page.getByRole('button', { name: 'Publier maintenant' }).click()
    await expect(page.locator('.statut-session.publie')).toBeVisible()
    await page.locator('.editeur').click()
    await page.keyboard.press('End')
    await page.keyboard.type(suffixeFermetureE2E)
    await expect(page.locator('.statut-session.sale')).toBeVisible()
  }

  await retourCorpus(page)
  await page.getByRole('button', { name: /Actualiser/ }).click()
  await expect(page.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
  await verifierBasculeLocalePuisGitLab(page)
}

test.describe('Consultation GitLab à deux profils', () => {
  test.skip(!configurationPresente, 'variables GITLAB_* absentes')
  test.setTimeout(180_000)

  test('deux postes isolés consultent le même contenu et ouvrent une session contrôlée', async () => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const jetonEcriture = configuration.token1 as string
    await amorcerConsultation(jetonEcriture)
    const teteInitiale = await teteBranche(jetonEcriture)
    const profil1 = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-1-'))
    const profil2 = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-2-'))
    let app1 = await lancerProfil(profil1)
    const app2 = await lancerProfil(profil2)

    try {
      await consulterDansProfil(
        await app1.firstWindow(),
        'user1',
        configuration.token1 as string,
        configuration.projetId as string,
        true,
      )
      await consulterDansProfil(
        await app2.firstWindow(),
        'user1',
        configuration.token1 as string,
      )

      const miroirs1 = readdirSync(join(profil1, 'miroirs'))
      const miroirs2 = readdirSync(join(profil2, 'miroirs'))
      expect(miroirs1).toHaveLength(1)
      expect(miroirs2).toHaveLength(1)
      expect(miroirs1[0]).toBe(miroirs2[0])
      expect(join(profil1, 'miroirs', miroirs1[0])).not.toBe(
        join(profil2, 'miroirs', miroirs2[0]),
      )

      await app1.close()
      app1 = await lancerProfil(profil1, true)
      const pageRedemarrée = await app1.firstWindow()
      await attendreAccueil(pageRedemarrée)
      await pageRedemarrée.locator('.recent').first().click()
      await expect(pageRedemarrée.locator('.modale-distant')).toBeVisible()
      await pageRedemarrée.locator('.secret-compte').fill(configuration.token1 as string)
      await pageRedemarrée.locator('.mini.ouvrir').first().click()
      await attendreCorpus(pageRedemarrée)
      await expect(pageRedemarrée.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
      await pageRedemarrée.locator('.carte-ent .crayon').click()
      await expect(pageRedemarrée.locator('.editeur')).toContainText(suffixeFermetureE2E)
      await retourCorpus(pageRedemarrée)
      expect(readdirSync(join(profil1, 'miroirs'))).toEqual(miroirs1)
      expect(await teteBranche(jetonEcriture)).not.toBe(teteInitiale)
    } finally {
      await Promise.allSettled([app1.close(), app2.close()])
      rmSync(profil1, { recursive: true, force: true })
      rmSync(profil2, { recursive: true, force: true })
    }
  })

  test('le bouton de création crée un corpus GitLab dans un projet existant', async () => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const racineCreation = `${racine}-creation-${Date.now().toString(36)}`
    const nomCreation = `Corpus créé ${idExecution}`
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-creation-'))
    const app = await lancerProfil(profil)
    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.nouveau-corpus-distant').click()
      await page.getByRole('tab', { name: 'GitLab' }).click()
      await page.locator('.url-gitlab').fill(configuration.url as string)
      await page.locator('.utilisateur-gitlab').fill('user1')
      await page.locator('.jeton-gitlab').fill(configuration.token1 as string)
      await page.getByRole('button', { name: 'Découvrir les projets' }).click()
      await page.locator('.projet-gitlab').selectOption(configuration.projetId as string)
      await expect(page.locator('.branche-gitlab')).toHaveValue(branche, { timeout: 20_000 })
      await page.locator('.racine-gitlab').fill(racineCreation)
      await page.locator('.champ-nom').fill(nomCreation)
      await page.getByRole('button', { name: 'Créer le corpus et l’ouvrir' }).click()
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
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un crash conserve une autosave et protège sa reprise', async () => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const racineCrash = `${racine}-crash-${Date.now().toString(36)}`
    const jeton = configuration.token1 as string
    await amorcerConsultation(jeton, configuration.projetId as string, racineCrash)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-crash-'))
    let app = await lancerProfil(profil)
    try {
      const page = await app.firstWindow()
      await ouvrirDestinationPourCrash(page, 'user1', jeton, racineCrash)
      const suffixe = ` Autosave crash ${idExecution}.`
      await page.locator('.editeur').click()
      await page.keyboard.press('End')
      await page.keyboard.type(suffixe)
      await expect(page.locator('.statut-session.sale')).toBeVisible({ timeout: 10_000 })
      app.process()?.kill('SIGKILL')
      await new Promise((resolve) => setTimeout(resolve, 1_000))

      app = await lancerProfil(profil, true)
      const pageRedemarree = await app.firstWindow()
      await attendreAccueil(pageRedemarree)
      await pageRedemarree.locator('.recent').first().click()
      await expect(pageRedemarree.locator('.modale-distant')).toBeVisible()
      await pageRedemarree.locator('.secret-compte').fill(jeton)
      await pageRedemarree.locator('.mini.ouvrir').first().click()
      await attendreCorpus(pageRedemarree)
      await pageRedemarree.locator('.carte-ent .crayon').click()
      await expect(pageRedemarree.locator('.editeur')).toContainText(suffixe.trim())
      await expect(pageRedemarree.locator('.editeur')).toHaveAttribute('contenteditable', 'false')
    } finally {
      await app.close().catch(() => undefined)
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un jeton invalide est refusé sans créer de miroir ni modifier le projet', async () => {
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const jetonEcriture = configuration.token1 as string
    const teteInitiale = await teteBranche(jetonEcriture)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-refus-'))
    const app = await lancerProfil(profil)

    try {
      const page = await app.firstWindow()
      await attendreAccueil(page)
      await page.locator('.carte-demo.distant-corpus').click()
      await page.getByRole('tab', { name: 'GitLab' }).click()
      await page.locator('.url-gitlab').fill(configuration.url as string)
      await page.locator('.utilisateur-gitlab').fill('user1')
      await page.locator('.jeton-gitlab').fill('jeton-invalide-e2e')
      await page.getByRole('button', { name: 'Découvrir les projets' }).click()
      await expect(page.locator('.modale-distant .msg')).toContainText('droits')
      expect(existsSync(join(profil, 'miroirs'))).toBe(false)
      expect(await teteBranche(jetonEcriture)).toBe(teteInitiale)
    } finally {
      await app.close()
      rmSync(profil, { recursive: true, force: true })
    }
  })

  test('un projet sans LFS reste consultable pour ses transcriptions', async () => {
    test.skip(!sansLfsConfigure, 'aucun projet sans LFS configuré')
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const projetSansLfs = configuration.projetSansLfsId as string
    const jeton = tokenSecondPoste as string
    await amorcerConsultation(jeton, projetSansLfs)
    const teteInitiale = await teteBranche(jeton, projetSansLfs)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-sans-lfs-'))
    const app = await lancerProfil(profil)

    try {
      await consulterDansProfil(
        await app.firstWindow(),
        'user1',
        jeton,
        projetSansLfs,
      )
      expect(await teteBranche(jeton, projetSansLfs)).not.toBe(teteInitiale)
    } finally {
      await app.close()
      rmSync(profil, { recursive: true, force: true })
    }
  })
})
