import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { Readable, Writable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import type { SurProgressionFichier } from '../distant/transfert'
import type { AutorisationGitLab } from './client'
import { fluxVerificationGitLab, installerFluxGitLab, verifierIdentiteContenuGitLab, type IdentiteContenuGitLab } from './transfert'

interface ActionLfs {
  href: string
  header?: Record<string, string>
}

interface ObjetLfs {
  oid: string
  size: number
  error?: unknown
  actions?: { upload?: ActionLfs; download?: ActionLfs; verify?: ActionLfs }
}

export interface ConfigurationLfsGitLab {
  urlInstance: string
  urlDepot: string
  utilisateur: string
  autorisation: AutorisationGitLab
  delaiTransfertMs?: number
}

export async function identifierFichierGitLab(chemin: string): Promise<IdentiteContenuGitLab> {
  const info = await lstat(chemin)
  if (!info.isFile()) throw new Error('Le média source n’est pas un fichier ordinaire.')
  const hash = createHash('sha256')
  let taille = 0
  for await (const morceau of createReadStream(chemin)) {
    hash.update(morceau)
    taille += morceau.byteLength
  }
  if (taille !== info.size) throw new Error('Le média source a changé pendant sa lecture.')
  return { taille, sha256: hash.digest('hex') }
}

export function pointeurLfsGitLab(identite: IdentiteContenuGitLab): string {
  verifierIdentiteContenuGitLab(identite)
  return `version https://git-lfs.github.com/spec/v1\noid sha256:${identite.sha256}\nsize ${identite.taille}\n`
}

/** Transfert LFS en flux ; les pointeurs restent publiés par le publieur de documents. */
export class ClientLfsGitLab {
  private readonly endpoint: string
  private readonly origine: string
  private readonly autorisation: string
  private readonly delaiTransfertMs: number

  constructor(configuration: ConfigurationLfsGitLab, private readonly fetchImpl: typeof fetch = fetch) {
    const instance = new URL(configuration.urlInstance)
    const depot = new URL(configuration.urlDepot)
    const local = instance.hostname === 'localhost' || instance.hostname === '127.0.0.1'
    if (
      (instance.protocol !== 'https:' && !(local && instance.protocol === 'http:')) ||
      instance.username || instance.password || instance.search || instance.hash ||
      depot.origin !== instance.origin || !depot.pathname.startsWith(`${instance.pathname.replace(/\/$/, '')}/`) ||
      depot.username || depot.password || depot.search || depot.hash ||
      !depot.pathname.endsWith('.git') || !configuration.utilisateur
    ) throw new Error('Adresse du dépôt LFS GitLab invalide.')
    const secret = configuration.autorisation.type === 'bearer'
      ? configuration.autorisation.accessToken : configuration.autorisation.jeton
    if (!secret) throw new Error('Accès LFS GitLab manquant.')
    const utilisateur = configuration.autorisation.type === 'bearer' ? 'oauth2' : configuration.utilisateur
    this.autorisation = `Basic ${Buffer.from(`${utilisateur}:${secret}`).toString('base64')}`
    this.endpoint = `${depot.toString()}/info/lfs/objects/batch`
    this.origine = instance.origin
    this.delaiTransfertMs = configuration.delaiTransfertMs ?? 30 * 60_000
    if (!Number.isFinite(this.delaiTransfertMs) || this.delaiTransfertMs <= 0) throw new Error('Délai LFS invalide.')
  }

  async televerserObjet(
    source: string,
    identite: IdentiteContenuGitLab,
    surProgression?: SurProgressionFichier,
    signal?: AbortSignal,
  ): Promise<void> {
    verifierIdentiteContenuGitLab(identite)
    signal?.throwIfAborted()
    const locale = await identifierFichierGitLab(source)
    if (locale.sha256 !== identite.sha256 || locale.taille !== identite.taille) {
      throw new Error('Le média local ne correspond plus à la source préparée.')
    }
    signal?.throwIfAborted()
    const objet = await this.demanderObjet('upload', identite, signal)
    if (objet.actions?.upload) {
      const lecture = createReadStream(source)
      const verification = fluxVerificationGitLab(identite, surProgression)
      const achevement = finished(verification)
      void achevement.catch(() => undefined)
      lecture.on('error', (erreur) => verification.destroy(erreur))
      const corps = Readable.toWeb(lecture.pipe(verification))
      try {
        await this.executerAction(objet.actions.upload, 'PUT', corps as unknown as BodyInit, signal, {
          'Content-Type': 'application/octet-stream', 'Content-Length': String(identite.taille),
        }, true)
        await achevement
      } finally {
        lecture.destroy()
        verification.destroy()
      }
      if (objet.actions.verify) {
        await this.executerAction(objet.actions.verify, 'POST', JSON.stringify({ oid: identite.sha256, size: identite.taille }), signal, {
          'Content-Type': 'application/vnd.git-lfs+json',
        })
      }
    }
    await this.confirmerObjet(identite, signal)
  }

  async telechargerObjet(
    identite: IdentiteContenuGitLab,
    destination: string,
    surProgression?: SurProgressionFichier,
    signal?: AbortSignal,
  ): Promise<void> {
    const reponse = await this.ouvrirObjet(identite, signal)
    await installerFluxGitLab(reponse, destination, identite, surProgression)
  }

  async confirmerObjet(identite: IdentiteContenuGitLab, signal?: AbortSignal): Promise<void> {
    const reponse = await this.ouvrirObjet(identite, signal)
    try {
      if (!reponse.body) throw new Error('Objet LFS sans contenu.')
      await pipeline(
        Readable.fromWeb(reponse.body as unknown as import('node:stream/web').ReadableStream),
        fluxVerificationGitLab(identite),
        new Writable({ write(_morceau, _encodage, terminer) { terminer() } }),
      )
    } finally {
      await reponse.body?.cancel().catch(() => undefined)
    }
  }

  private async ouvrirObjet(identite: IdentiteContenuGitLab, signal?: AbortSignal): Promise<Response> {
    const objet = await this.demanderObjet('download', identite, signal)
    if (!objet.actions?.download) throw new Error('Objet LFS inaccessible dans le projet destination.')
    return this.requeteAction(objet.actions.download, 'GET', undefined, signal)
  }

  private async demanderObjet(operation: 'upload' | 'download', identite: IdentiteContenuGitLab, signal?: AbortSignal): Promise<ObjetLfs> {
    verifierIdentiteContenuGitLab(identite)
    const reponse = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: this.autorisation,
        Accept: 'application/vnd.git-lfs+json', 'Content-Type': 'application/vnd.git-lfs+json',
      },
      body: JSON.stringify({ operation, transfers: ['basic'], objects: [{ oid: identite.sha256, size: identite.taille }] }),
      redirect: 'error', signal: this.signal(signal, false),
    })
    if (!reponse.ok) {
      await reponse.body?.cancel()
      throw new Error(`Accès au stockage LFS refusé (HTTP ${reponse.status}).`)
    }
    const texte = await lireJsonBorne(reponse)
    let resultat: { transfer?: string; objects?: ObjetLfs[] }
    try {
      resultat = JSON.parse(texte) as typeof resultat
    } catch {
      throw new Error('Réponse du stockage LFS illisible.')
    }
    const objet = resultat?.objects?.[0]
    if (
      !resultat || !Array.isArray(resultat.objects) ||
      (resultat.transfer !== undefined && resultat.transfer !== 'basic') ||
      resultat.objects?.length !== 1 || !objet || objet.error !== undefined ||
      objet.oid !== identite.sha256 || objet.size !== identite.taille
    ) throw new Error('Le stockage LFS n’a pas confirmé l’objet demandé.')
    return objet
  }

  private async executerAction(
    action: ActionLfs, methode: string, corps: BodyInit, signal?: AbortSignal,
    entetes?: Record<string, string>, flux = false,
  ): Promise<void> {
    const reponse = await this.requeteAction(action, methode, corps, signal, entetes, flux)
    await reponse.body?.cancel()
  }

  private async requeteAction(
    action: ActionLfs, methode: string, corps?: BodyInit, signal?: AbortSignal,
    entetes?: Record<string, string>, flux = false,
  ): Promise<Response> {
    const url = new URL(action.href)
    if (url.origin !== this.origine || url.username || url.password || url.hash) {
      throw new Error('Le stockage LFS propose une adresse non autorisée. Aucun accès n’a été transmis.')
    }
    const headers = new Headers(action.header)
    headers.delete('transfer-encoding')
    headers.delete('host')
    for (const [nom, valeur] of Object.entries(entetes ?? {})) headers.set(nom, valeur)
    const options: RequestInit & { duplex?: 'half' } = {
      method: methode, headers, body: corps, redirect: 'error', signal: this.signal(signal),
      ...(flux ? { duplex: 'half' as const } : {}),
    }
    const reponse = await this.fetchImpl(url, options)
    if (!reponse.ok) {
      await reponse.body?.cancel()
      throw new Error(`Transfert LFS refusé (HTTP ${reponse.status}).`)
    }
    return reponse
  }

  private signal(signal?: AbortSignal, transfert = true): AbortSignal {
    const delai = transfert ? this.delaiTransfertMs : 15_000
    return signal
      ? AbortSignal.any([signal, AbortSignal.timeout(delai)])
      : AbortSignal.timeout(delai)
  }
}

async function lireJsonBorne(reponse: Response): Promise<string> {
  if (!reponse.body) throw new Error('Réponse LFS vide.')
  const lecteur = reponse.body.getReader()
  const decodeur = new TextDecoder()
  let texte = ''
  let octets = 0
  try {
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) return texte + decodeur.decode()
      octets += value.byteLength
      if (octets > 128 * 1024) {
        await lecteur.cancel()
        throw new Error('Réponse LFS trop volumineuse.')
      }
      texte += decodeur.decode(value, { stream: true })
    }
  } finally {
    lecteur.releaseLock()
  }
}
