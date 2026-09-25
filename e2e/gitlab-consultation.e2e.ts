/**
 *  Consultation GitLab dans deux profils Electron isolés.
 *
 *  Le test est opt-in. Il amorce un corpus synthétique dans une racine unique,
 *  puis vérifie que deux comptes consultent le même commit sans écrire dans GitLab.
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
  token2: process.env.GITLAB_USER2_TOKEN,
}
const configurationPresente = Object.values(configuration).every(Boolean)
const branche = 'main'
const idExecution = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const racine = `consultation-e2e-${idExecution}`
const idEntretien = 'entretien-consultation'
const titreEntretien = `Entretien GitLab ${idExecution}`
const texteEntretien = `Consultation GitLab de qualification ${idExecution}.`
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
            file_path: `${racine}/corpus.json`,
            content: Buffer.from(JSON.stringify(corpus)).toString('base64'),
            encoding: 'base64',
          },
          {
            action: 'create',
            file_path: `${racine}/entretiens/${idEntretien}.json`,
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

async function consulterDansProfil(
  page: Page,
  utilisateur: string,
  jeton: string,
  projetId = configuration.projetId as string,
): Promise<void> {
  await attendreAccueil(page)
  await page.locator('.carte-demo.distant-corpus').click()
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
  await expect(page.locator('.editeur')).toHaveAttribute('contenteditable', 'false')

  await retourCorpus(page)
  await page.getByRole('button', { name: /Actualiser/ }).click()
  await expect(page.locator('.ent-titre', { hasText: titreEntretien })).toBeVisible()
  await verifierBasculeLocalePuisGitLab(page)
}

test.describe('Consultation GitLab à deux profils', () => {
  test.skip(!configurationPresente, 'variables GITLAB_* absentes')
  test.setTimeout(180_000)

  test('deux comptes isolés consultent le même commit sans commit parasite', async () => {
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
      await consulterDansProfil(await app1.firstWindow(), 'user1', configuration.token1 as string)
      await consulterDansProfil(await app2.firstWindow(), 'user2', configuration.token2 as string)

      const miroirs1 = readdirSync(join(profil1, 'miroirs'))
      const miroirs2 = readdirSync(join(profil2, 'miroirs'))
      expect(miroirs1).toHaveLength(1)
      expect(miroirs2).toHaveLength(1)
      expect(miroirs1[0]).not.toBe(miroirs2[0])

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
      expect(readdirSync(join(profil1, 'miroirs'))).toEqual(miroirs1)
      expect(await teteBranche(jetonEcriture)).toBe(teteInitiale)
    } finally {
      await Promise.allSettled([app1.close(), app2.close()])
      rmSync(profil1, { recursive: true, force: true })
      rmSync(profil2, { recursive: true, force: true })
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
    if (executableEmpaquete && !existsSync(executableEmpaquete)) {
      throw new Error('Binaire Linux empaqueté absent. Lancez npm run pack:dir.')
    }
    const projetSansLfs = configuration.projetSansLfsId as string
    const jeton = configuration.token2 as string
    await amorcerConsultation(jeton, projetSansLfs)
    const teteInitiale = await teteBranche(jeton, projetSansLfs)
    const profil = mkdtempSync(join(tmpdir(), 'sonal-gitlab-e2e-sans-lfs-'))
    const app = await lancerProfil(profil)

    try {
      await consulterDansProfil(
        await app.firstWindow(),
        'user2',
        jeton,
        projetSansLfs,
      )
      expect(await teteBranche(jeton, projetSansLfs)).toBe(teteInitiale)
    } finally {
      await app.close()
      rmSync(profil, { recursive: true, force: true })
    }
  })
})
