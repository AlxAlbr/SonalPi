import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { decoderCrp } from '../encodage'
import type { ClientGitLab } from './client'

export interface InformationFichierV1GitLab {
  chemin: string
  taille: number
  sha256: string
  stockage: 'git' | 'lfs'
}

const SHA256 = /^[a-f0-9]{64}$/
const SIGNATURE_LFS = 'version https://git-lfs.github.com/spec/v1'

/** Les chemins V1 sont relatifs au corpus, jamais aux fichiers de ce poste. */
export function resoudreCheminV1GitLab(cheminCrp: string, reference: string): string {
  const chemin = reference.replace(/\\/g, '/')
  if (
    !chemin.trim() || chemin.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(chemin) ||
    /[\u0000-\u001f\u007f]/.test(chemin)
  ) {
    throw new Error(`Le fichier « ${reference} » est hors du dépôt GitLab. La préparation est arrêtée ; fournissez une source accessible dans le dépôt.`)
  }
  const resolu = posix.normalize(posix.join(posix.dirname(cheminCrp), chemin))
  if (resolu === '.' || resolu === '..' || resolu.startsWith('../')) {
    throw new Error(`Le fichier « ${reference} » est hors du dépôt GitLab.`)
  }
  return resolu
}

/** Lit les documents V1 et leurs vrais objets LFS, au même commit. */
export class LectureV1GitLab {
  private readonly informations = new Map<string, InformationFichierV1GitLab>()

  constructor(private readonly client: ClientGitLab, readonly commit: string) {
    if (!/^[a-f0-9]{40}$/i.test(commit)) throw new Error('Commit source GitLab invalide.')
  }

  async information(chemin: string): Promise<InformationFichierV1GitLab> {
    const connue = this.informations.get(chemin)
    if (connue) return connue
    const entetes = await this.client.lireEntetes(this.endpoint(chemin), { ref: this.commit })
    const tailleTexte = entetes.get('x-gitlab-size')
    const taille = tailleTexte !== null && /^\d+$/.test(tailleTexte) ? Number(tailleTexte) : NaN
    const sha256 = entetes.get('x-gitlab-content-sha256') ?? ''
    if (!Number.isSafeInteger(taille) || taille < 0 || !SHA256.test(sha256)) {
      throw new Error(`Les informations du fichier « ${chemin} » sont incomplètes.`)
    }
    let information: InformationFichierV1GitLab = { chemin, taille, sha256, stockage: 'git' }
    if (taille <= 1024) {
      const octets = await this.client.lireOctets(`${this.endpoint(chemin)}/raw`, {
        ref: this.commit, lfs: 'false',
      }, { tailleMaxOctets: 1024 })
      verifierContenu(octets, information)
      const texte = new TextDecoder().decode(octets)
      if (texte.startsWith(SIGNATURE_LFS)) {
        const pointeur = /^version https:\/\/git-lfs.github.com\/spec\/v1\r?\noid sha256:([a-f0-9]{64})\r?\nsize (\d+)\r?\n?$/.exec(texte)
        const tailleObjet = pointeur ? Number(pointeur[2]) : NaN
        if (!pointeur || !Number.isSafeInteger(tailleObjet) || tailleObjet < 0) {
          throw new Error(`Pointeur LFS illisible pour « ${chemin} ».`)
        }
        information = { chemin, taille: tailleObjet, sha256: pointeur[1], stockage: 'lfs' }
      }
    }
    this.informations.set(chemin, information)
    return information
  }

  async lireDocument(chemin: string): Promise<string> {
    const information = await this.information(chemin)
    const octets = await this.client.lireOctets(`${this.endpoint(chemin)}/raw`, {
      ref: this.commit,
      lfs: information.stockage === 'lfs' ? 'true' : 'false',
    })
    verifierContenu(octets, information)
    return decoderCrp(Buffer.from(octets))
  }

  private endpoint(chemin: string): string {
    if (
      !chemin || chemin.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(chemin) ||
      chemin.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) throw new Error('Chemin source GitLab invalide.')
    return this.client.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}`)
  }
}

function verifierContenu(octets: Uint8Array, information: InformationFichierV1GitLab): void {
  if (
    octets.byteLength !== information.taille ||
    createHash('sha256').update(octets).digest('hex') !== information.sha256
  ) throw new Error(`Le contenu du fichier « ${information.chemin} » ne correspond pas à la source annoncée.`)
}
