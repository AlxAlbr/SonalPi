/**
 *  Banc de qualification contre un GitLab réel.
 *
 *  Le banc reste désactivé sans variables GITLAB_* explicites. Il n'utilise
 *  que des chemins uniques dans les projets synthétiques qui lui sont dédiés.
 *  Les fichiers et verrous sont conservés pour permettre l'examen après test.
 */

import { once } from 'node:events'
import { createHash } from 'node:crypto'
import {
  createReadStream,
  createWriteStream,
  mkdtempSync,
  rmSync,
  statfsSync,
} from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { setTimeout as attendre } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { BailGitLab, DepotCommitsGitLabClient } from '../../src/main/gitlab/bailGitLab'
import { ClientGitLab } from '../../src/main/gitlab/client'
import { JournalPublicationGitLab, ReconciliateurPublicationGitLab } from '../../src/main/gitlab/journalPublication'
import { JournalSessionsGitLab } from '../../src/main/gitlab/journalSession'
import { PublieurGitLab } from '../../src/main/gitlab/publication'
import { SessionGitLab } from '../../src/main/gitlab/session'
import { StockageLocalEntretienGitLab } from '../../src/main/gitlab/stockageSession'

const configuration = {
  url: process.env.GITLAB_URL?.replace(/\/$/, ''),
  token1: process.env.GITLAB_USER1_TOKEN,
  token1SecondPoste: process.env.GITLAB_USER1_SECOND_TOKEN,
  token2: process.env.GITLAB_USER2_TOKEN,
  projetLfsId: process.env.GITLAB_LFS_PROJECT_ID,
  projetLfsPath: process.env.GITLAB_LFS_PROJECT_PATH,
  projetSansLfsId: process.env.GITLAB_NO_LFS_PROJECT_ID,
  projetSansLfsPath: process.env.GITLAB_NO_LFS_PROJECT_PATH,
}

const configurationPresente = Object.values(configuration).every((valeur) => Boolean(valeur))
const campagneBailActivee = process.env.GITLAB_BAIL_CAMPAIGN === '1'
const nombreCommitsBail = Number(process.env.GITLAB_BAIL_COMMITS ?? 480)
const tailleLfsVolumineuse = Number(process.env.GITLAB_LFS_TAILLE_OCTETS ?? 32 * 1024 * 1024)
const tailleLfsAnnulation = Number(process.env.GITLAB_LFS_TAILLE_ANNULATION ?? 8 * 1024 * 1024)
const idExecution = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

interface ReponseHttp<T = unknown> {
  statut: number
  corps: T
  texte: string
}

interface FichierGitLab {
  file_path: string
  content: string
  last_commit_id: string
}

interface VerrouLfs {
  id: string
  path: string
  owner?: { name?: string }
}

interface ActionLfs {
  href: string
  header?: Record<string, string>
}

interface ObjetLfs {
  oid: string
  size: number
  actions?: {
    upload?: ActionLfs
    verify?: ActionLfs
    download?: ActionLfs
  }
  error?: { code: number; message: string }
}

function detail(reponse: ReponseHttp): string {
  return `HTTP ${reponse.statut}: ${reponse.texte.slice(0, 500)}`
}

async function requeteBrute<T>(url: string, initialisation: RequestInit = {}): Promise<ReponseHttp<T>> {
  const reponse = await fetch(url, {
    ...initialisation,
    signal: AbortSignal.timeout(15_000),
  })
  const texte = await reponse.text()
  let corps: T
  try {
    corps = JSON.parse(texte) as T
  } catch {
    corps = texte as T
  }
  return { statut: reponse.status, corps, texte }
}

function requete<T>(url: string, token: string, initialisation: RequestInit = {}): Promise<ReponseHttp<T>> {
  const entetes = new Headers(initialisation.headers)
  entetes.set('PRIVATE-TOKEN', token)
  if (initialisation.body && !entetes.has('Content-Type')) entetes.set('Content-Type', 'application/json')
  return requeteBrute<T>(url, {
    ...initialisation,
    headers: entetes,
  })
}

function api<T>(chemin: string, token: string, initialisation: RequestInit = {}): Promise<ReponseHttp<T>> {
  return requete<T>(`${configuration.url}/api/v4${chemin}`, token, initialisation)
}

async function compterCommitsBranche(projet: string, jeton: string): Promise<number> {
  let total = 0
  for (let page = 1; page <= 100; page += 1) {
    const commits = await api<unknown[]>(
      `/projects/${projet}/repository/commits?ref_name=main&per_page=100&page=${page}`,
      jeton,
    )
    if (commits.statut !== 200) throw new Error(detail(commits))
    total += commits.corps.length
    if (commits.corps.length < 100) return total
  }
  throw new Error('Le comptage des commits GitLab dépasse la borne de qualification.')
}

function cheminFichier(projetId: string, chemin: string): string {
  return `/projects/${projetId}/repository/files/${encodeURIComponent(chemin)}?ref=main`
}

function lireFichier(projetId: string, chemin: string, token: string): Promise<ReponseHttp<FichierGitLab>> {
  return api<FichierGitLab>(cheminFichier(projetId, chemin), token)
}

function publierCommit(
  projetId: string,
  token: string,
  message: string,
  actions: Array<Record<string, unknown>>,
): Promise<ReponseHttp<{ id: string }>> {
  return api<{ id: string }>(`/projects/${projetId}/repository/commits`, token, {
    method: 'POST',
    body: JSON.stringify({ branch: 'main', commit_message: message, actions }),
  })
}

async function requeteLfs<T>(
  chemin: string,
  utilisateur: string,
  token: string,
  initialisation: RequestInit = {},
  projet = configuration.projetLfsPath as string,
): Promise<ReponseHttp<T>> {
  const entetes = new Headers(initialisation.headers)
  entetes.set('Authorization', `Basic ${Buffer.from(`${utilisateur}:${token}`).toString('base64')}`)
  entetes.set('Accept', 'application/vnd.git-lfs+json')
  entetes.set('Content-Type', 'application/vnd.git-lfs+json')
  return requeteBrute<T>(`${configuration.url}/${projet}.git/info/lfs${chemin}`, {
    ...initialisation,
    headers: entetes,
  })
}

function demanderObjetLfs(
  operation: 'upload' | 'download',
  objet: { oid: string; size: number },
  utilisateur: string,
  token: string,
  projet = configuration.projetLfsPath as string,
): Promise<ReponseHttp<{ objects: ObjetLfs[] }>> {
  return requeteLfs<{ objects: ObjetLfs[] }>(
    '/objects/batch',
    utilisateur,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        operation,
        transfers: ['basic'],
        ref: { name: 'refs/heads/main' },
        objects: [objet],
        hash_algo: 'sha256',
      }),
    },
    projet,
  )
}

function entetesActionLfs(action: ActionLfs): Headers {
  const entetes = new Headers()
  for (const [nom, valeur] of Object.entries(action.header ?? {})) {
    if (nom.toLowerCase() !== 'transfer-encoding') entetes.set(nom, valeur)
  }
  return entetes
}

function verifierOrigineActionLfs(action: ActionLfs): void {
  expect(new URL(action.href).origin).toBe(new URL(configuration.url as string).origin)
}

async function creerFichierSynthétique(fichier: string, taille: number): Promise<void> {
  const flux = createWriteStream(fichier)
  const morceau = Buffer.alloc(256 * 1024)
  for (let position = 0; position < taille; position += morceau.length) {
    const longueur = Math.min(morceau.length, taille - position)
    for (let index = 0; index < longueur; index += 1) {
      morceau[index] = (position + index) % 251
    }
    if (position === 0) Buffer.from(`Sonal ${idExecution}`).copy(morceau)
    if (!flux.write(morceau.subarray(0, longueur))) {
      await once(flux, 'drain')
    }
  }
  flux.end()
  await once(flux, 'finish')
}

async function hacherFichier(fichier: string): Promise<string> {
  const hache = createHash('sha256')
  for await (const morceau of createReadStream(fichier)) hache.update(morceau)
  return hache.digest('hex')
}

function initialisationFlux(body: Readable, signal?: AbortSignal): RequestInit {
  return {
    body: body as unknown as BodyInit,
    ...(signal ? { signal } : {}),
    duplex: 'half',
  } as RequestInit
}

async function mesurerPicHeap<T>(operation: () => Promise<T>): Promise<{
  valeur: T
  picHeap: number
  dureeMs: number
}> {
  let picHeap = process.memoryUsage().heapUsed
  const debut = performance.now()
  const minuteur = setInterval(() => {
    picHeap = Math.max(picHeap, process.memoryUsage().heapUsed)
  }, 25)
  try {
    return { valeur: await operation(), picHeap, dureeMs: performance.now() - debut }
  } finally {
    clearInterval(minuteur)
  }
}

async function creerFluxLent(
  fichier: string,
  taille: number,
  compteurOctets: { lus: number },
): Promise<Readable> {
  const handle = await open(fichier, 'r')
  let position = 0
  return new Readable({
    highWaterMark: 256 * 1024,
    async read() {
      if (this.destroyed) return
      if (position >= taille) {
        this.push(null)
        return
      }
      await attendre(25)
      if (this.destroyed) return
      const longueur = Math.min(256 * 1024, taille - position)
      const morceau = Buffer.allocUnsafe(longueur)
      const { bytesRead } = await handle.read(morceau, 0, longueur, position)
      if (bytesRead !== longueur) {
        this.destroy(new Error(`Lecture LFS interrompue à ${position}.`))
        return
      }
      position += bytesRead
      compteurOctets.lus = position
      this.push(morceau)
    },
    async destroy(erreur, callback) {
      await handle.close()
      callback(erreur)
    },
  })
}

async function telechargerVersFichier(action: ActionLfs, fichier: string): Promise<void> {
  verifierOrigineActionLfs(action)
  const reponse = await fetch(action.href, {
    headers: entetesActionLfs(action),
    signal: AbortSignal.timeout(120_000),
  })
  expect(reponse.status, `Le téléchargement LFS a répondu HTTP ${reponse.status}.`).toBe(200)
  if (!reponse.body) throw new Error('Réponse LFS sans corps.')
  await pipeline(
    Readable.fromWeb(reponse.body as never),
    createWriteStream(fichier),
  )
}

const decrire = configurationPresente ? describe : describe.skip

decrire('Contrat GitLab réel', () => {
  it('authentifie les deux comptes et expose les capacités LFS attendues', { timeout: 30_000 }, async () => {
    const version = await api<{ version: string }>('/version', configuration.token1 as string)
    expect(version.statut, detail(version)).toBe(200)
    expect(version.corps.version).toMatch(/^18\./)

    const projetLfs = await api<{ lfs_enabled: boolean }>(
      `/projects/${configuration.projetLfsId}`,
      configuration.token2 as string,
    )
    const projetSansLfs = await api<{ lfs_enabled: boolean }>(
      `/projects/${configuration.projetSansLfsId}`,
      configuration.token2 as string,
    )
    expect(projetLfs.statut, detail(projetLfs)).toBe(200)
    expect(projetLfs.corps.lfs_enabled).toBe(true)
    expect(projetSansLfs.statut, detail(projetSansLfs)).toBe(200)
    expect(projetSansLfs.corps.lfs_enabled).toBe(false)
  })

  it('joue le cycle complet d’une session locale sur le projet de qualification', { timeout: 60_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const token = configuration.token1 as string
    const chemin = `qualification/${idExecution}-session-cycle.json`
    const contenuInitial = JSON.stringify({ formatVersion: 8, cycle: 'initial' })
    const contenuModifie = JSON.stringify({ formatVersion: 8, cycle: 'modifie' })
    const creation = await publierCommit(projet, token, `qualification ${idExecution}: session initiale`, [
      { action: 'create', file_path: chemin, content: contenuInitial },
    ])
    expect(creation.statut, detail(creation)).toBe(201)

    const racine = mkdtempSync(join(tmpdir(), 'sonal-gitlab-session-cycle-'))
    try {
      const client = new ClientGitLab({
        urlInstance: configuration.url as string,
        projetId: Number(projet),
        autorisation: { type: 'jeton-prive', jeton: token },
      })
      const depot = new DepotCommitsGitLabClient(client)
      const journalRepertoire = join(racine, 'operations')
      const journal = new JournalPublicationGitLab('session-cycle', journalRepertoire)
      const journalSessions = new JournalSessionsGitLab('session-cycle', journalRepertoire)
      const coordination = new BailGitLab({
        branche: 'main',
        depot,
        identite: () => ({ userId: 'user1', machineId: 'poste-cycle', sessionId: idExecution }),
      })
      const publication = new PublieurGitLab({
        branche: 'main',
        depot,
        coordination,
        journal,
      })
      const session = new SessionGitLab({
        id: 'session-cycle',
        ressource: `entretien:${idExecution}`,
        cheminRelatif: chemin,
        cheminDistant: chemin,
        branche: 'main',
        depot,
        coordination,
        publication,
        stockageLocal: new StockageLocalEntretienGitLab(racine, chemin),
        journal,
        journalSessions,
        reconciliateur: new ReconciliateurPublicationGitLab(depot, journal),
      })

      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      await new StockageLocalEntretienGitLab(racine, chemin).ecrire(contenuModifie)
      await session.marquerSale()
      await expect(session.publier()).resolves.toMatchObject({ statut: 'confirme' })
      await expect(session.renouveler()).resolves.toBe(true)
      await expect(session.fermer()).resolves.toEqual({ fermee: true })

      const observe = await lireFichier(projet, chemin, token)
      expect(observe.statut, detail(observe)).toBe(200)
      expect(Buffer.from(observe.corps.content, 'base64').toString('utf8')).toBe(contenuModifie)
      expect(journalSessions.lister()).toEqual([])
    } finally {
      rmSync(racine, { recursive: true, force: true })
    }
  })

  it('refuse une création concurrente et conserve l’atomicité du commit', { timeout: 30_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const token = configuration.token1 as string
    const existant = `qualification/${idExecution}-existant.txt`
    const marqueur = `qualification/${idExecution}-marqueur-atomique.txt`
    const creation = await publierCommit(projet, token, `qualification ${idExecution}: création`, [
      { action: 'create', file_path: existant, content: 'version 1' },
    ])
    expect(creation.statut, detail(creation)).toBe(201)

    const conflit = await publierCommit(projet, token, `qualification ${idExecution}: conflit`, [
      { action: 'create', file_path: marqueur, content: 'ne doit pas être publié' },
      { action: 'create', file_path: existant, content: 'écrasement interdit' },
    ])
    expect(conflit.statut, detail(conflit)).toBe(400)

    const marqueurAbsent = await lireFichier(projet, marqueur, token)
    expect(marqueurAbsent.statut, detail(marqueurAbsent)).toBe(404)
    const contenuExistant = await lireFichier(projet, existant, token)
    expect(Buffer.from(contenuExistant.corps.content, 'base64').toString('utf8')).toBe('version 1')
  })

  it('refuse une garde last_commit_id périmée', { timeout: 30_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const token1 = configuration.token1 as string
    const token2 = configuration.token2 as string
    const chemin = `qualification/${idExecution}-garde.txt`
    const creation = await publierCommit(projet, token1, `qualification ${idExecution}: base gardée`, [
      { action: 'create', file_path: chemin, content: 'base' },
    ])
    expect(creation.statut, detail(creation)).toBe(201)

    const base = await lireFichier(projet, chemin, token1)
    expect(base.statut, detail(base)).toBe(200)
    const publication = await publierCommit(projet, token2, `qualification ${idExecution}: publication fraîche`, [
      {
        action: 'update',
        file_path: chemin,
        content: 'version fraîche',
        last_commit_id: base.corps.last_commit_id,
      },
    ])
    expect(publication.statut, detail(publication)).toBe(201)

    const perimee = await publierCommit(projet, token1, `qualification ${idExecution}: publication périmée`, [
      {
        action: 'update',
        file_path: chemin,
        content: 'version périmée',
        last_commit_id: base.corps.last_commit_id,
      },
    ])
    expect(perimee.statut, detail(perimee)).toBe(400)
    const final = await lireFichier(projet, chemin, token1)
    expect(Buffer.from(final.corps.content, 'base64').toString('utf8')).toBe('version fraîche')
  })

  it('applique les gardes périmées aux suppressions et déplacements', { timeout: 45_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const token1 = configuration.token1 as string
    const token2 = configuration.token2 as string
    const aDeplacer = `qualification/${idExecution}-a-deplacer.txt`
    const deplace = `qualification/${idExecution}-deplace.txt`
    const aSupprimer = `qualification/${idExecution}-a-supprimer.txt`

    const creation = await publierCommit(projet, token1, `qualification ${idExecution}: bases move/delete`, [
      { action: 'create', file_path: aDeplacer, content: 'déplacement v1' },
      { action: 'create', file_path: aSupprimer, content: 'suppression v1' },
    ])
    expect(creation.statut, detail(creation)).toBe(201)
    const baseDeplacement = await lireFichier(projet, aDeplacer, token1)
    const baseSuppression = await lireFichier(projet, aSupprimer, token1)

    const modification = await publierCommit(projet, token2, `qualification ${idExecution}: concurrence move/delete`, [
      {
        action: 'update',
        file_path: aDeplacer,
        content: 'déplacement v2',
        last_commit_id: baseDeplacement.corps.last_commit_id,
      },
      {
        action: 'update',
        file_path: aSupprimer,
        content: 'suppression v2',
        last_commit_id: baseSuppression.corps.last_commit_id,
      },
    ])
    expect(modification.statut, detail(modification)).toBe(201)

    const suppressionPerimee = await publierCommit(projet, token1, `qualification ${idExecution}: delete périmé`, [
      { action: 'delete', file_path: aSupprimer, last_commit_id: baseSuppression.corps.last_commit_id },
    ])
    expect(suppressionPerimee.statut, detail(suppressionPerimee)).toBe(400)
    const deplacementPerime = await publierCommit(projet, token1, `qualification ${idExecution}: move périmé`, [
      {
        action: 'move',
        previous_path: aDeplacer,
        file_path: deplace,
        last_commit_id: baseDeplacement.corps.last_commit_id,
      },
    ])
    expect(deplacementPerime.statut, detail(deplacementPerime)).toBe(400)

    const fraisDeplacement = await lireFichier(projet, aDeplacer, token1)
    const fraisSuppression = await lireFichier(projet, aSupprimer, token1)
    const finalisation = await publierCommit(projet, token1, `qualification ${idExecution}: move/delete frais`, [
      {
        action: 'move',
        previous_path: aDeplacer,
        file_path: deplace,
        last_commit_id: fraisDeplacement.corps.last_commit_id,
      },
      { action: 'delete', file_path: aSupprimer, last_commit_id: fraisSuppression.corps.last_commit_id },
    ])
    expect(finalisation.statut, detail(finalisation)).toBe(201)
    expect((await lireFichier(projet, aDeplacer, token1)).statut).toBe(404)
    expect((await lireFichier(projet, aSupprimer, token1)).statut).toBe(404)
    const fichierDeplace = await lireFichier(projet, deplace, token1)
    expect(Buffer.from(fichierDeplace.corps.content, 'base64').toString('utf8')).toBe('déplacement v2')
  })

  it('réconcilie un commit accepté dont la réponse réseau est perdue', { timeout: 45_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const token = configuration.token1 as string
    const operationId = `sonal-operation-${idExecution}`
    const chemin = `qualification/${idExecution}-reconciliation.txt`
    const corps = JSON.stringify({
      branch: 'main',
      commit_message: `${operationId}: réponse perdue`,
      actions: [{ action: 'create', file_path: chemin, content: operationId }],
    })
    let confirmerAmont!: (statut: number) => void
    let refuserAmont!: (erreur: unknown) => void
    const reponseAmont = new Promise<number>((resolve, reject) => {
      confirmerAmont = resolve
      refuserAmont = reject
    })
    const proxy = createServer((requeteEntrante, reponseSortante) => {
      requeteEntrante.resume()
      void fetch(`${configuration.url}/api/v4/projects/${projet}/repository/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'PRIVATE-TOKEN': token },
        body: corps,
        signal: AbortSignal.timeout(15_000),
      }).then(
        async (reponse) => {
          confirmerAmont(reponse.status)
          await reponse.body?.cancel()
          reponseSortante.destroy()
        },
        (erreur: unknown) => {
          refuserAmont(erreur)
          reponseSortante.destroy()
        },
      )
    })
    await new Promise<void>((resolve, reject) => {
      proxy.once('error', reject)
      proxy.listen(0, '127.0.0.1', () => resolve())
    })

    try {
      const adresse = proxy.address() as AddressInfo
      await expect(
        fetch(`http://127.0.0.1:${adresse.port}/commit`, {
          method: 'POST',
          body: corps,
          signal: AbortSignal.timeout(20_000),
        }),
      ).rejects.toThrow()
      expect(await reponseAmont).toBe(201)
    } finally {
      await new Promise<void>((resolve) => proxy.close(() => resolve()))
    }

    const historique = await api<Array<{ id: string; title: string }>>(
      `/projects/${projet}/repository/commits?ref_name=main&per_page=20&search=${encodeURIComponent(operationId)}`,
      token,
    )
    expect(historique.statut, detail(historique)).toBe(200)
    expect(historique.corps.some((commit) => commit.title.includes(operationId))).toBe(true)
    const fichier = await lireFichier(projet, chemin, token)
    expect(Buffer.from(fichier.corps.content, 'base64').toString('utf8')).toBe(operationId)
  })

  it('transfère un objet LFS binaire et le relit avec le second compte', { timeout: 60_000 }, async () => {
    const token1 = configuration.token1 as string
    const token2 = configuration.token2 as string
    const contenu = Buffer.alloc(1_048_833)
    for (let index = 0; index < contenu.length; index += 1) contenu[index] = index % 251
    Buffer.from(`Sonal LFS ${idExecution}`).copy(contenu)
    const objet = { oid: createHash('sha256').update(contenu).digest('hex'), size: contenu.length }

    const demandeEnvoi = await demanderObjetLfs('upload', objet, 'user1', token1)
    expect(demandeEnvoi.statut, detail(demandeEnvoi)).toBe(200)
    const objetEnvoi = demandeEnvoi.corps.objects[0]
    expect(objetEnvoi.error).toBeUndefined()
    const actionEnvoi = objetEnvoi.actions?.upload
    expect(actionEnvoi).toBeDefined()
    verifierOrigineActionLfs(actionEnvoi as ActionLfs)

    const envoi = await fetch((actionEnvoi as ActionLfs).href, {
      method: 'PUT',
      headers: entetesActionLfs(actionEnvoi as ActionLfs),
      body: contenu,
      signal: AbortSignal.timeout(30_000),
    })
    expect(envoi.status, `L'envoi LFS a répondu HTTP ${envoi.status}.`).toBe(200)

    const actionVerification = objetEnvoi.actions?.verify
    if (actionVerification) {
      verifierOrigineActionLfs(actionVerification)
      const entetes = entetesActionLfs(actionVerification)
      entetes.set('Content-Type', 'application/vnd.git-lfs+json')
      const verification = await fetch(actionVerification.href, {
        method: 'POST',
        headers: entetes,
        body: JSON.stringify(objet),
        signal: AbortSignal.timeout(15_000),
      })
      expect(verification.status, `La vérification LFS a répondu HTTP ${verification.status}.`).toBe(200)
    }

    const dossier = `qualification/${idExecution}`
    const cheminMedia = `${dossier}/media.bin`
    const pointeur = `version https://git-lfs.github.com/spec/v1\noid sha256:${objet.oid}\nsize ${objet.size}\n`
    const publication = await publierCommit(
      configuration.projetLfsId as string,
      token1,
      `qualification ${idExecution}: pointeur LFS`,
      [
        {
          action: 'create',
          file_path: `${dossier}/.gitattributes`,
          content: '*.bin filter=lfs diff=lfs merge=lfs -text\n',
        },
        { action: 'create', file_path: cheminMedia, content: pointeur },
        {
          action: 'create',
          file_path: `${dossier}/entretien.json`,
          content: JSON.stringify({ audioDistant: { chemin: cheminMedia } }),
        },
      ],
    )
    expect(publication.statut, detail(publication)).toBe(201)

    const fichierPointeur = await lireFichier(configuration.projetLfsId as string, cheminMedia, token2)
    expect(Buffer.from(fichierPointeur.corps.content, 'base64').toString('utf8')).toBe(pointeur)

    const demandeLecture = await demanderObjetLfs('download', objet, 'user2', token2)
    expect(demandeLecture.statut, detail(demandeLecture)).toBe(200)
    const objetLecture = demandeLecture.corps.objects[0]
    expect(objetLecture.error).toBeUndefined()
    const actionLecture = objetLecture.actions?.download
    expect(actionLecture).toBeDefined()
    verifierOrigineActionLfs(actionLecture as ActionLfs)
    const lecture = await fetch((actionLecture as ActionLfs).href, {
      headers: entetesActionLfs(actionLecture as ActionLfs),
      signal: AbortSignal.timeout(30_000),
    })
    expect(lecture.status, `La lecture LFS a répondu HTTP ${lecture.status}.`).toBe(200)
    const recu = Buffer.from(await lecture.arrayBuffer())
    expect(recu.length).toBe(objet.size)
    expect(createHash('sha256').update(recu).digest('hex')).toBe(objet.oid)
    expect(recu.equals(contenu)).toBe(true)
  })

  it('transfère un objet LFS volumineux en flux et le relit sur disque', { timeout: 300_000 }, async () => {
    expect(Number.isSafeInteger(tailleLfsVolumineuse)).toBe(true)
    expect(tailleLfsVolumineuse).toBeGreaterThanOrEqual(1024 * 1024)
    expect(tailleLfsVolumineuse).toBeLessThanOrEqual(512 * 1024 * 1024)

    const repertoire = mkdtempSync(join(tmpdir(), 'sonal-lfs-volume-'))
    const source = join(repertoire, 'source.bin')
    const telecharge = join(repertoire, 'telecharge.bin')
    try {
      const systeme = statfsSync(repertoire)
      const espaceLibre = systeme.bavail * systeme.bsize
      expect(espaceLibre, 'Espace disque insuffisant pour la qualification LFS.').toBeGreaterThan(
        tailleLfsVolumineuse * 2 + 100 * 1024 * 1024,
      )
      await creerFichierSynthétique(source, tailleLfsVolumineuse)
      const oid = await hacherFichier(source)
      const objet = { oid, size: tailleLfsVolumineuse }
      const demande = await demanderObjetLfs('upload', objet, 'user1', configuration.token1 as string)
      expect(demande.statut, detail(demande)).toBe(200)
      const actionEnvoi = demande.corps.objects[0].actions?.upload
      expect(actionEnvoi).toBeDefined()
      verifierOrigineActionLfs(actionEnvoi as ActionLfs)

      const mesureEnvoi = await mesurerPicHeap(async () => {
        const reponse = await fetch((actionEnvoi as ActionLfs).href, {
          method: 'PUT',
          headers: entetesActionLfs(actionEnvoi as ActionLfs),
          ...initialisationFlux(createReadStream(source)),
          signal: AbortSignal.timeout(180_000),
        })
        return reponse
      })
      expect(mesureEnvoi.valeur.status, `L'envoi LFS a répondu HTTP ${mesureEnvoi.valeur.status}.`).toBe(200)
      await mesureEnvoi.valeur.body?.cancel()

      const actionVerification = demande.corps.objects[0].actions?.verify
      if (actionVerification) {
        verifierOrigineActionLfs(actionVerification)
        const entetes = entetesActionLfs(actionVerification)
        entetes.set('Content-Type', 'application/vnd.git-lfs+json')
        const verification = await fetch(actionVerification.href, {
          method: 'POST',
          headers: entetes,
          body: JSON.stringify(objet),
          signal: AbortSignal.timeout(30_000),
        })
        expect(verification.status, detail(verification)).toBe(200)
      }

      const dossier = `qualification/${idExecution}/volumineux`
      const cheminMedia = `${dossier}/media.bin`
      const pointeur = `version https://git-lfs.github.com/spec/v1\noid sha256:${oid}\nsize ${objet.size}\n`
      const publication = await publierCommit(
        configuration.projetLfsId as string,
        configuration.token1 as string,
        `qualification ${idExecution}: pointeur LFS volumineux`,
        [
          {
            action: 'create',
            file_path: `${dossier}/.gitattributes`,
            content: '*.bin filter=lfs diff=lfs merge=lfs -text\n',
          },
          { action: 'create', file_path: cheminMedia, content: pointeur },
          {
            action: 'create',
            file_path: `${dossier}/entretien.json`,
            content: JSON.stringify({ audioDistant: { chemin: cheminMedia } }),
          },
        ],
      )
      expect(publication.statut, detail(publication)).toBe(201)

      const demandeLecture = await demanderObjetLfs('download', objet, 'user2', configuration.token2 as string)
      expect(demandeLecture.statut, detail(demandeLecture)).toBe(200)
      const actionLecture = demandeLecture.corps.objects[0].actions?.download
      expect(actionLecture).toBeDefined()
      const mesureLecture = await mesurerPicHeap(async () => {
        await telechargerVersFichier(actionLecture as ActionLfs, telecharge)
      })
      const telechargeStat = await stat(telecharge)
      expect(telechargeStat.size).toBe(tailleLfsVolumineuse)
      expect(await hacherFichier(telecharge)).toBe(oid)
      const projet = await api<{ statistics?: { lfs_objects_size?: number } }>(
        `/projects/${configuration.projetLfsId}?statistics=true`,
        configuration.token1 as string,
      )
      expect(projet.statut, detail(projet)).toBe(200)
      const bilan = {
        octets: tailleLfsVolumineuse,
        uploadMs: Math.round(mesureEnvoi.dureeMs),
        lectureMs: Math.round(mesureLecture.dureeMs),
        picHeapEnvoi: mesureEnvoi.picHeap,
        picHeapLecture: mesureLecture.picHeap,
        lfsStockeApres: projet.corps.statistics?.lfs_objects_size ?? null,
      }
      process.stderr.write(`LFS volumineux : ${JSON.stringify(bilan)}\n`)
    } finally {
      rmSync(repertoire, { recursive: true, force: true })
    }
  })

  it('annule un upload LFS partiel puis réessaie le même objet sans erreur', { timeout: 180_000 }, async () => {
    expect(Number.isSafeInteger(tailleLfsAnnulation)).toBe(true)
    expect(tailleLfsAnnulation).toBeGreaterThanOrEqual(2 * 1024 * 1024)
    expect(tailleLfsAnnulation).toBeLessThanOrEqual(128 * 1024 * 1024)

    const repertoire = mkdtempSync(join(tmpdir(), 'sonal-lfs-annulation-'))
    const source = join(repertoire, 'source.bin')
    const telecharge = join(repertoire, 'telecharge.bin')
    try {
      await creerFichierSynthétique(source, tailleLfsAnnulation)
      const oid = await hacherFichier(source)
      const objet = { oid, size: tailleLfsAnnulation }
      const demande = await demanderObjetLfs('upload', objet, 'user1', configuration.token1 as string)
      expect(demande.statut, detail(demande)).toBe(200)
      const actionEnvoi = demande.corps.objects[0].actions?.upload
      expect(actionEnvoi).toBeDefined()
      verifierOrigineActionLfs(actionEnvoi as ActionLfs)

      const controleur = new AbortController()
      const compteur = { lus: 0 }
      const fluxAnnule = await creerFluxLent(source, tailleLfsAnnulation, compteur)
      const uploadAnnule = fetch((actionEnvoi as ActionLfs).href, {
        method: 'PUT',
        headers: entetesActionLfs(actionEnvoi as ActionLfs),
        ...initialisationFlux(fluxAnnule, controleur.signal),
      })
      const minuteur = setTimeout(() => controleur.abort(), 80)
      let octetsAuRefus = 0
      try {
        await expect(uploadAnnule).rejects.toThrow()
      } finally {
        clearTimeout(minuteur)
        octetsAuRefus = compteur.lus
        fluxAnnule.destroy()
      }
      expect(octetsAuRefus).toBeGreaterThan(0)
      expect(octetsAuRefus).toBeLessThan(tailleLfsAnnulation)

      const reprise = await fetch((actionEnvoi as ActionLfs).href, {
        method: 'PUT',
        headers: entetesActionLfs(actionEnvoi as ActionLfs),
        ...initialisationFlux(createReadStream(source)),
        signal: AbortSignal.timeout(120_000),
      })
      expect(reprise.status, `La reprise LFS a répondu HTTP ${reprise.status}.`).toBe(200)
      await reprise.body?.cancel()

      const demandeLecture = await demanderObjetLfs('download', objet, 'user2', configuration.token2 as string)
      expect(demandeLecture.statut, detail(demandeLecture)).toBe(200)
      const actionLecture = demandeLecture.corps.objects[0].actions?.download
      expect(actionLecture).toBeDefined()
      await telechargerVersFichier(actionLecture as ActionLfs, telecharge)
      expect((await stat(telecharge)).size).toBe(tailleLfsAnnulation)
      expect(await hacherFichier(telecharge)).toBe(oid)
      process.stderr.write(
        `LFS annulé : ${JSON.stringify({ octets: tailleLfsAnnulation, octetsEnvoyesAvantAnnulation: octetsAuRefus, reprise: true })}\n`,
      )
    } finally {
      rmSync(repertoire, { recursive: true, force: true })
    }
  })

  it('refuse le batch LFS lorsque le projet le désactive', { timeout: 30_000 }, async () => {
    const contenu = Buffer.from(`LFS désactivé ${idExecution}`)
    const objet = { oid: createHash('sha256').update(contenu).digest('hex'), size: contenu.length }
    const reponse = await demanderObjetLfs(
      'upload',
      objet,
      'user1',
      configuration.token1 as string,
      configuration.projetSansLfsPath as string,
    )
    const erreurObjet = reponse.corps.objects?.[0]?.error
    expect(reponse.statut !== 200 || Boolean(erreurObjet), detail(reponse)).toBe(true)
  })

  it('borne une ancienne génération avec un bail versionné, même sous le même compte', { timeout: 45_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const tokenPosteA = configuration.token1 as string
    const tokenPosteB = configuration.token1SecondPoste as string
    const bailConcurrent = `qualification/${idExecution}-bail-concurrent.json`
    const generationA = `${idExecution}-poste-a`
    const generationB = `${idExecution}-poste-b`

    const [acquisitionA, acquisitionB] = await Promise.all([
      publierCommit(projet, tokenPosteA, `qualification ${idExecution}: acquisition A`, [
        { action: 'create', file_path: bailConcurrent, content: JSON.stringify({ generation: generationA }) },
      ]),
      publierCommit(projet, tokenPosteB, `qualification ${idExecution}: acquisition B`, [
        { action: 'create', file_path: bailConcurrent, content: JSON.stringify({ generation: generationB }) },
      ]),
    ])
    expect([acquisitionA.statut, acquisitionB.statut].sort()).toEqual([201, 400])

    const bail = `qualification/${idExecution}-bail-generation.json`
    const creation = await publierCommit(projet, tokenPosteA, `qualification ${idExecution}: bail génération A`, [
      { action: 'create', file_path: bail, content: JSON.stringify({ generation: generationA, compteur: 1 }) },
    ])
    expect(creation.statut, detail(creation)).toBe(201)
    const baseA = await lireFichier(projet, bail, tokenPosteA)

    const repriseB = await publierCommit(projet, tokenPosteB, `qualification ${idExecution}: reprise génération B`, [
      {
        action: 'update',
        file_path: bail,
        content: JSON.stringify({ generation: generationB, compteur: 1 }),
        last_commit_id: baseA.corps.last_commit_id,
      },
    ])
    expect(repriseB.statut, detail(repriseB)).toBe(201)
    const baseB = await lireFichier(projet, bail, tokenPosteB)
    const marqueurA = `qualification/${idExecution}-publication-ancienne.txt`

    const publicationA = await publierCommit(projet, tokenPosteA, `qualification ${idExecution}: ancienne génération`, [
      { action: 'create', file_path: marqueurA, content: 'ne doit pas être publié' },
      {
        action: 'update',
        file_path: bail,
        content: JSON.stringify({ generation: generationA, compteur: 2 }),
        last_commit_id: baseA.corps.last_commit_id,
      },
    ])
    expect(publicationA.statut, detail(publicationA)).toBe(400)
    expect((await lireFichier(projet, marqueurA, tokenPosteA)).statut).toBe(404)

    const marqueurB = `qualification/${idExecution}-publication-courante.txt`
    const publicationB = await publierCommit(projet, tokenPosteB, `qualification ${idExecution}: génération courante`, [
      { action: 'create', file_path: marqueurB, content: 'publié par la génération courante' },
      {
        action: 'update',
        file_path: bail,
        content: JSON.stringify({ generation: generationB, compteur: 2 }),
        last_commit_id: baseB.corps.last_commit_id,
      },
    ])
    expect(publicationB.statut, detail(publicationB)).toBe(201)
    const fichierB = await lireFichier(projet, marqueurB, tokenPosteA)
    expect(Buffer.from(fichierB.corps.content, 'base64').toString('utf8')).toBe('publié par la génération courante')
  })

  it('refuse l’ancienne génération après une reprise à horloge décalée', { timeout: 60_000 }, async () => {
    const projetId = Number(configuration.projetLfsId)
    const client = new ClientGitLab({
      urlInstance: configuration.url as string,
      projetId,
      autorisation: { type: 'jeton-prive', jeton: configuration.token1 as string },
    })
    const depot = new DepotCommitsGitLabClient(client)
    const instantBase = Date.now()
    const posteA = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => ({
        userId: 'user1',
        machineId: `qualification-${idExecution}-a`,
        sessionId: `session-${idExecution}-a`,
      }),
      maintenant: () => instantBase,
      nouvelleGeneration: () => `generation-${idExecution}-a`,
      dureeBailMs: 60_000,
    })
    const posteB = new BailGitLab({
      branche: 'main',
      depot,
      identite: () => ({
        userId: 'user1',
        machineId: `qualification-${idExecution}-b`,
        sessionId: `session-${idExecution}-b`,
      }),
      maintenant: () => instantBase + 120_000,
      nouvelleGeneration: () => `generation-${idExecution}-b`,
      dureeBailMs: 60_000,
    })
    const ancien = await posteA.acquireRessource(`${idExecution}-entretien-horloge`)
    expect(ancien.ok).toBe(true)
    if (!ancien.ok) throw new Error('Acquisition réelle du bail impossible.')
    const reprise = await posteB.acquireRessource(`${idExecution}-entretien-horloge`)
    expect(reprise.ok).toBe(true)
    if (!reprise.ok) throw new Error('Reprise réelle du bail impossible.')

    const marqueurAncien = `qualification/${idExecution}-publication-ancienne-coordonnee.txt`
    const publieurA = new PublieurGitLab({ branche: 'main', depot, coordination: posteA })
    await expect(publieurA.publierSousDroit({
      operationId: `${idExecution}-ancienne-generation-coordonnee`,
      actions: [{ action: 'create', chemin: marqueurAncien, contenu: 'interdit' }],
    }, ancien.droit)).resolves.toEqual({ statut: 'refuse', raison: 'droit-perdu' })
    expect((await lireFichier(projetId.toString(), marqueurAncien, configuration.token1 as string)).statut).toBe(404)

    const marqueurCourant = `qualification/${idExecution}-publication-courante-coordonnee.txt`
    const publieurB = new PublieurGitLab({ branche: 'main', depot, coordination: posteB })
    await expect(publieurB.publierSousDroit({
      operationId: `${idExecution}-generation-courante-coordonnee`,
      actions: [{ action: 'create', chemin: marqueurCourant, contenu: 'accepté' }],
    }, reprise.droit)).resolves.toMatchObject({ statut: 'confirme', compteurBail: 2 })
    const contenu = await lireFichier(
      projetId.toString(),
      marqueurCourant,
      configuration.token2 as string,
    )
    expect(contenu.statut, detail(contenu)).toBe(200)
    expect(Buffer.from(contenu.corps.content, 'base64').toString('utf8')).toBe('accepté')
    await expect(posteB.liberer(reprise.droit)).resolves.toBe('libere')
  })

  it('protège une source lue par une action conditionnelle dans le même commit', { timeout: 45_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const token1 = configuration.token1 as string
    const token2 = configuration.token2 as string
    const source = `qualification/${idExecution}-dependance.json`
    const cible = `qualification/${idExecution}-cible.json`
    const sourceV1 = JSON.stringify({ definition: 'v1' })
    const sourceV2 = JSON.stringify({ definition: 'v2' })

    const creation = await publierCommit(projet, token1, `qualification ${idExecution}: dépendance métier`, [
      { action: 'create', file_path: source, content: sourceV1 },
      { action: 'create', file_path: cible, content: JSON.stringify({ transcription: 'v1' }) },
    ])
    expect(creation.statut, detail(creation)).toBe(201)
    const baseSource = await lireFichier(projet, source, token1)
    const baseCible = await lireFichier(projet, cible, token1)

    const publicationFraiche = await publierCommit(projet, token1, `qualification ${idExecution}: source gardée`, [
      {
        action: 'update',
        file_path: cible,
        content: JSON.stringify({ transcription: 'v2' }),
        last_commit_id: baseCible.corps.last_commit_id,
      },
      {
        action: 'update',
        file_path: source,
        content: sourceV1,
        last_commit_id: baseSource.corps.last_commit_id,
      },
    ])
    expect(publicationFraiche.statut, detail(publicationFraiche)).toBe(201)

    const sourceAvantConcurrence = await lireFichier(projet, source, token2)
    const cibleAvantConcurrence = await lireFichier(projet, cible, token1)
    const modificationSource = await publierCommit(projet, token2, `qualification ${idExecution}: source concurrente`, [
      {
        action: 'update',
        file_path: source,
        content: sourceV2,
        last_commit_id: sourceAvantConcurrence.corps.last_commit_id,
      },
    ])
    expect(modificationSource.statut, detail(modificationSource)).toBe(201)

    const publicationProtegee = await publierCommit(projet, token1, `qualification ${idExecution}: source périmée`, [
      {
        action: 'update',
        file_path: cible,
        content: JSON.stringify({ transcription: 'v3 protégée' }),
        last_commit_id: cibleAvantConcurrence.corps.last_commit_id,
      },
      {
        action: 'update',
        file_path: source,
        content: sourceV1,
        last_commit_id: sourceAvantConcurrence.corps.last_commit_id,
      },
    ])
    expect(publicationProtegee.statut, detail(publicationProtegee)).toBe(400)
    const cibleApresRefus = await lireFichier(projet, cible, token1)
    expect(Buffer.from(cibleApresRefus.corps.content, 'base64').toString('utf8')).toBe(
      JSON.stringify({ transcription: 'v2' }),
    )

    const publicationSansGardeSource = await publierCommit(
      projet,
      token1,
      `qualification ${idExecution}: source non gardée`,
      [
        {
          action: 'update',
          file_path: cible,
          content: JSON.stringify({ transcription: 'v3 non protégée' }),
          last_commit_id: cibleApresRefus.corps.last_commit_id,
        },
      ],
    )
    expect(publicationSansGardeSource.statut, detail(publicationSansGardeSource)).toBe(201)
    const sourceFinale = await lireFichier(projet, source, token1)
    expect(Buffer.from(sourceFinale.corps.content, 'base64').toString('utf8')).toBe(sourceV2)
  })

  /** Une garde au contenu inchangé est-elle une garde pure ? La réponse doit
   *  être la même avec et sans LFS : seule l'API Repository entre en jeu. */
  async function mesurerGardeInchangee(projet: string, etiquette: string) {
    const token1 = configuration.token1 as string
    const token2 = configuration.token2 as string
    const source = `qualification/${idExecution}-session-source.json`
    const corpus = `qualification/${idExecution}-session-corpus.json`
    const contenuSource = JSON.stringify({ formatVersion: 8, cycle: 'source' })
    const contenuSourceModifie = JSON.stringify({ formatVersion: 8, cycle: 'source modifie' })
    const contenuCorpus = JSON.stringify({ membership: {} })

    const creation = await publierCommit(projet, token1, `qualification ${idExecution}: source et corpus`, [
      { action: 'create', file_path: source, content: contenuSource },
      { action: 'create', file_path: corpus, content: contenuCorpus },
    ])
    expect(creation.statut, detail(creation)).toBe(201)

    const racine = mkdtempSync(join(tmpdir(), 'sonal-gitlab-garde-inchangee-'))
    try {
      const client = new ClientGitLab({
        urlInstance: configuration.url as string,
        projetId: Number(projet),
        autorisation: { type: 'jeton-prive', jeton: token1 },
      })
      const depot = new DepotCommitsGitLabClient(client)
      const journal = new JournalPublicationGitLab('garde-inchangee', join(racine, 'operations'))
      const journalSessions = new JournalSessionsGitLab('garde-inchangee', join(racine, 'operations'))
      const coordination = new BailGitLab({
        branche: 'main',
        depot,
        identite: () => ({ userId: 'user1', machineId: 'poste-garde', sessionId: idExecution }),
      })
      const session = new SessionGitLab({
        id: 'garde-inchangee',
        ressource: `entretien:${idExecution}`,
        cheminRelatif: source,
        cheminDistant: source,
        branche: 'main',
        depot,
        coordination,
        publication: new PublieurGitLab({ branche: 'main', depot, coordination, journal }),
        stockageLocal: new StockageLocalEntretienGitLab(racine, source),
        journal,
        journalSessions,
        reconciliateur: new ReconciliateurPublicationGitLab(depot, journal),
      })
      const stockage = new StockageLocalEntretienGitLab(racine, source)

      await expect(session.ouvrir()).resolves.toMatchObject({ etat: 'edition' })
      const sourceAvant = await lireFichier(projet, source, token1)
      const corpusAvant = await lireFichier(projet, corpus, token1)

      // Un second compte modifie corpus.json et garde la source sans la changer.
      const publication = await publierCommit(
        projet,
        token2,
        `qualification ${idExecution}: corpus gardé, source inchangée`,
        [
          {
            action: 'update',
            file_path: corpus,
            content: JSON.stringify({ membership: { e1: { titre: 'E1' } } }),
            last_commit_id: corpusAvant.corps.last_commit_id,
          },
          {
            action: 'update',
            file_path: source,
            content: contenuSource,
            last_commit_id: sourceAvant.corps.last_commit_id,
          },
        ],
      )
      expect(publication.statut, detail(publication)).toBe(201)

      const sourceApres = await lireFichier(projet, source, token1)
      const sourceAvancee = sourceApres.corps.last_commit_id !== sourceAvant.corps.last_commit_id
      const contenuInchange = Buffer.from(sourceApres.corps.content, 'base64').toString('utf8')
      // Fait mesuré : c'est lui qui décide si une session doit réadopter sa garde.
      console.log(
        `[banc] garde inchangée (${etiquette}) — last_commit_id `
        + `${sourceAvant.corps.last_commit_id.slice(0, 8)}`
        + ` → ${sourceApres.corps.last_commit_id.slice(0, 8)} (avancé : ${sourceAvancee})`,
      )
      expect(contenuInchange).toBe(contenuSource)

      // Sans candidat, la session ne publie rien : sa garde n'est pas consultée.
      await expect(session.publier()).resolves.toMatchObject({ statut: 'confirme' })
      expect(await session.revalider()).toBe(!sourceAvancee)

      await stockage.ecrire(contenuSourceModifie)
      await session.marquerSale()
      if (sourceAvancee) {
        // Le cycle est bloqué, et le candidat doit survivre au refus.
        await expect(session.publier()).resolves.toMatchObject({ statut: 'refuse', raison: 'conflit' })
        await expect(session.renouveler()).resolves.toBe(false)
        await expect(session.preserverCandidat()).resolves.toBe(true)
        expect(await stockage.lire()).toBe(contenuSourceModifie)
        expect(journalSessions.lire(`entretien:${idExecution}`)).not.toBeNull()
      } else {
        await expect(session.publier()).resolves.toMatchObject({ statut: 'confirme' })
        await expect(session.renouveler()).resolves.toBe(true)
      }
      await expect(session.fermer()).resolves.toEqual({ fermee: true })

      // Une garde de source réellement périmée refuse tout le commit, et le
      // corpus reste intact. Un témoin distinct rend la mesure indépendante de
      // ce que la session vient de publier.
      const temoin = `qualification/${idExecution}-temoin.json`
      const creationTemoine = await publierCommit(
        projet,
        token1,
        `qualification ${idExecution}: témoin`,
        [{ action: 'create', file_path: temoin, content: contenuSource }],
      )
      expect(creationTemoine.statut, detail(creationTemoine)).toBe(201)
      const gardeTemoine = await lireFichier(projet, temoin, token1)
      const corpusAvantRefus = await lireFichier(projet, corpus, token1)
      const modificationTemoin = await publierCommit(
        projet,
        token2,
        `qualification ${idExecution}: témoin modifié`,
        [{
          action: 'update',
          file_path: temoin,
          content: contenuSourceModifie,
          last_commit_id: gardeTemoine.corps.last_commit_id,
        }],
      )
      expect(modificationTemoin.statut, detail(modificationTemoin)).toBe(201)
      const refuse = await publierCommit(
        projet,
        token1,
        `qualification ${idExecution}: garde de source périmée`,
        [
          {
            action: 'update',
            file_path: corpus,
            content: JSON.stringify({ membership: { e2: { titre: 'E2' } } }),
            last_commit_id: corpusAvantRefus.corps.last_commit_id,
          },
          {
            action: 'update',
            file_path: temoin,
            content: contenuSource,
            last_commit_id: gardeTemoine.corps.last_commit_id,
          },
        ],
      )
      expect(refuse.statut, detail(refuse)).toBe(400)
      const corpusFinal = await lireFichier(projet, corpus, token1)
      expect(Buffer.from(corpusFinal.corps.content, 'base64').toString('utf8'))
        .toBe(Buffer.from(corpusAvantRefus.corps.content, 'base64').toString('utf8'))
    } finally {

      rmSync(racine, { recursive: true, force: true })
    }
  }

  it('une garde de source inchangée n’est qu’une garde, projet avec LFS', { timeout: 120_000 }, async () => {
    await mesurerGardeInchangee(configuration.projetLfsId as string, 'avec LFS')
  })

  it('une garde de source inchangée n’est qu’une garde, projet sans LFS', { timeout: 120_000 }, async () => {
    await mesurerGardeInchangee(configuration.projetSansLfsId as string, 'sans LFS')
  })

  it('sérialise les renouvellements du bail et mesure leur coût local', { timeout: 60_000 }, async () => {
    const projet = configuration.projetLfsId as string
    const tokenA = configuration.token1 as string
    const tokenB = configuration.token1SecondPoste as string
    const chemin = `qualification/${idExecution}-bail-renouvellement.json`
    const creation = await publierCommit(projet, tokenA, `qualification ${idExecution}: bail à renouveler`, [
      { action: 'create', file_path: chemin, content: JSON.stringify({ generation: idExecution, compteur: 0 }) },
    ])
    expect(creation.statut, detail(creation)).toBe(201)
    const base = await lireFichier(projet, chemin, tokenA)

    const [premier, concurrent] = await Promise.all([
      publierCommit(projet, tokenA, `qualification ${idExecution}: renouvellement concurrent A`, [
        {
          action: 'update',
          file_path: chemin,
          content: JSON.stringify({ generation: idExecution, compteur: 1, poste: 'A' }),
          last_commit_id: base.corps.last_commit_id,
        },
      ]),
      publierCommit(projet, tokenB, `qualification ${idExecution}: renouvellement concurrent B`, [
        {
          action: 'update',
          file_path: chemin,
          content: JSON.stringify({ generation: idExecution, compteur: 1, poste: 'B' }),
          last_commit_id: base.corps.last_commit_id,
        },
      ]),
    ])
    expect([premier.statut, concurrent.statut].sort()).toEqual([201, 400])

    let garde = (await lireFichier(projet, chemin, tokenA)).corps.last_commit_id
    const nombreRenouvellements = 8
    const debut = performance.now()
    for (let compteur = 2; compteur < nombreRenouvellements + 2; compteur += 1) {
      const renouvellement = await publierCommit(
        projet,
        tokenA,
        `qualification ${idExecution}: renouvellement ${compteur}`,
        [
          {
            action: 'update',
            file_path: chemin,
            content: JSON.stringify({ generation: idExecution, compteur }),
            last_commit_id: garde,
          },
        ],
      )
      expect(renouvellement.statut, detail(renouvellement)).toBe(201)
      garde = renouvellement.corps.id
    }
    const duree = performance.now() - debut
    console.info(
      `Qualification GitLab : ${nombreRenouvellements} renouvellements en ${duree.toFixed(0)} ms, ` +
        `${(duree / nombreRenouvellements).toFixed(0)} ms/commit.`,
    )
    const final = await lireFichier(projet, chemin, tokenA)
    const contenu = JSON.parse(Buffer.from(final.corps.content, 'base64').toString('utf8')) as { compteur: number }
    expect(contenu.compteur).toBe(nombreRenouvellements + 1)
  })

  describe.skipIf(!campagneBailActivee)('campagne longue du bail', () => {
    it('mesure une journée accélérée de renouvellements et la présence de CI', { timeout: 900_000 }, async () => {
      expect(Number.isSafeInteger(nombreCommitsBail), 'GITLAB_BAIL_COMMITS doit être entier.').toBe(true)
      expect(nombreCommitsBail).toBeGreaterThanOrEqual(1)
      expect(nombreCommitsBail).toBeLessThanOrEqual(2_000)

      const projet = configuration.projetLfsId as string
      const jeton = configuration.token1 as string
      const chemin = `qualification/${idExecution}-bail-journee.json`
      const projetAvant = await api<{
        statistics?: { repository_size?: number }
      }>(`/projects/${projet}?statistics=true`, jeton)
      expect(projetAvant.statut, detail(projetAvant)).toBe(200)
      const commitsAvant = await compterCommitsBranche(projet, jeton)
      const configurationCi = await lireFichier(projet, '.gitlab-ci.yml', jeton)
      const ciConfiguree = configurationCi.statut === 200

      const creation = await publierCommit(projet, jeton, `qualification ${idExecution}: début journée`, [
        {
          action: 'create',
          file_path: chemin,
          content: JSON.stringify({ generation: idExecution, compteur: 0 }),
        },
      ])
      expect(creation.statut, detail(creation)).toBe(201)

      let garde = creation.corps.id
      const durees: number[] = []
      let premierPipeline: string | null = null
      const debut = performance.now()
      for (let compteur = 1; compteur <= nombreCommitsBail; compteur += 1) {
        const instantRenouvellement = Date.now() + compteur * 60_000
        const debutRenouvellement = performance.now()
        const renouvellement = await publierCommit(
          projet,
          jeton,
          `qualification ${idExecution}: journée ${compteur}`,
          [
            {
              action: 'update',
              file_path: chemin,
              content: JSON.stringify({
                generation: idExecution,
                compteur,
                echeance: new Date(instantRenouvellement).toISOString(),
              }),
              last_commit_id: garde,
            },
          ],
        )
        durees.push(performance.now() - debutRenouvellement)
        expect(renouvellement.statut, detail(renouvellement)).toBe(201)
        garde = renouvellement.corps.id

        if (compteur === 1 && ciConfiguree) {
          for (let tentative = 0; tentative < 10 && !premierPipeline; tentative += 1) {
            const pipelines = await api<Array<{ status: string }>>(
              `/projects/${projet}/pipelines?sha=${encodeURIComponent(garde)}&per_page=1`,
              jeton,
            )
            premierPipeline = pipelines.corps[0]?.status ?? null
            if (!premierPipeline) await new Promise((resolve) => setTimeout(resolve, 500))
          }
        }
      }
      const dureeTotale = performance.now() - debut
      const final = await lireFichier(projet, chemin, jeton)
      const contenu = JSON.parse(Buffer.from(final.corps.content, 'base64').toString('utf8')) as {
        compteur: number
      }
      expect(contenu.compteur).toBe(nombreCommitsBail)

      const projetApres = await api<{
        statistics?: { repository_size?: number }
      }>(`/projects/${projet}?statistics=true`, jeton)
      expect(projetApres.statut, detail(projetApres)).toBe(200)
      const commitsApres = await compterCommitsBranche(projet, jeton)
      const triees = [...durees].sort((a, b) => a - b)
      const percentile = (fraction: number): number =>
        triees[Math.min(triees.length - 1, Math.floor(triees.length * fraction))] ?? 0
      const bilan = {
        renewlements: nombreCommitsBail,
        intervalleSimuleSecondes: 60,
        dureeTotaleMs: Math.round(dureeTotale),
        medianeMs: Math.round(percentile(0.5)),
        p95Ms: Math.round(percentile(0.95)),
        tailleDepotAvant: projetAvant.corps.statistics?.repository_size ?? null,
        tailleDepotApres: projetApres.corps.statistics?.repository_size ?? null,
        commitsAvant,
        commitsApres,
        ci: ciConfiguree ? (premierPipeline ?? 'non observée') : 'non configurée',
      }
      process.stderr.write(`Campagne GitLab : ${JSON.stringify(bilan)}\n`)
      expect(commitsApres - commitsAvant).toBeGreaterThanOrEqual(nombreCommitsBail + 1)
    })
  })

  it('impose LFS Locks aux commits REST, mais identifie le détenteur par compte', { timeout: 45_000 }, async () => {
    const chemin = `qualification/${idExecution}-verrou.sonal`
    const token1 = configuration.token1 as string
    const token1SecondPoste = configuration.token1SecondPoste as string
    const token2 = configuration.token2 as string

    const acquisition = await requeteLfs<{ lock: VerrouLfs }>('/locks', 'user1', token1, {
      method: 'POST',
      body: JSON.stringify({ path: chemin }),
    })
    expect(acquisition.statut, detail(acquisition)).toBe(201)
    expect(acquisition.corps.lock.path).toBe(chemin)

    const memeCompte = await requeteLfs<{ lock?: VerrouLfs }>('/locks', 'user1', token1SecondPoste, {
      method: 'POST',
      body: JSON.stringify({ path: chemin }),
    })
    expect(memeCompte.statut, detail(memeCompte)).toBe(409)
    expect(memeCompte.corps.lock?.owner?.name).toBe('user1')

    const publicationAutrePoste = await publierCommit(
      configuration.projetLfsId as string,
      token1SecondPoste,
      `qualification ${idExecution}: autre poste du même compte`,
      [{ action: 'create', file_path: chemin, content: 'publication du second poste' }],
    )
    expect(publicationAutrePoste.statut, detail(publicationAutrePoste)).toBe(201)

    const autreCompte = await requeteLfs<{ lock?: VerrouLfs }>('/locks', 'user2', token2, {
      method: 'POST',
      body: JSON.stringify({ path: chemin }),
    })
    expect(autreCompte.statut, detail(autreCompte)).toBe(409)

    const reprise = await requeteLfs<{ lock: VerrouLfs }>(
      `/locks/${acquisition.corps.lock.id}/unlock`,
      'user2',
      token2,
      { method: 'POST', body: JSON.stringify({ force: true }) },
    )
    expect(reprise.statut, detail(reprise)).toBe(200)

    const nouvelleAcquisition = await requeteLfs<{ lock: VerrouLfs }>('/locks', 'user2', token2, {
      method: 'POST',
      body: JSON.stringify({ path: chemin }),
    })
    expect(nouvelleAcquisition.statut, detail(nouvelleAcquisition)).toBe(201)

    const publicationAncienDetenteur = await publierCommit(
      configuration.projetLfsId as string,
      token1,
      `qualification ${idExecution}: ancien détenteur`,
      [{ action: 'update', file_path: chemin, content: 'publication malgré le verrou repris' }],
    )
    expect(publicationAncienDetenteur.statut, detail(publicationAncienDetenteur)).toBe(400)
    expect(publicationAncienDetenteur.texte).toContain('locked in Git LFS by @user2')

    const final = await lireFichier(configuration.projetLfsId as string, chemin, token1)
    expect(Buffer.from(final.corps.content, 'base64').toString('utf8')).toBe('publication du second poste')
  })
})

if (!configurationPresente) {
  describe.skip('Contrat GitLab réel — configuration absente', () => {
    it('charger le fichier qualification.env et NODE_EXTRA_CA_CERTS pour activer le banc', () => {})
  })
}
