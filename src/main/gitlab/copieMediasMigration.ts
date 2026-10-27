import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { estDestinationAutreMigration, type FichierAutreMigration } from '../../shared/corpus/conservationMigration'
import type { MediaMigrationGitLab } from '../../shared/corpus/migrationGitLab'
import { referenceMediaDistant, type ReferenceMediaDistant } from '../../shared/format'
import type { SurProgressionFichier } from '../distant/transfert'
import { verifierCheminMediaRelatif } from '../medias/designation'
import { ClientWebDAV, ErreurHttp } from '../webdav/client'
import { ClientLfsGitLab, identifierFichierGitLab } from './lfs'
import { verifierIdentiteContenuGitLab, type TransfertGitLab, type IdentiteContenuGitLab } from './transfert'

type PortCopieWebDAV = Pick<ClientWebDAV, 'mkcol' | 'propfind' | 'putFichier' | 'getBinaireFichier'>

export type DestinationCopieMediaMigration =
  | { type: 'depot'; client: Pick<ClientLfsGitLab, 'televerserObjet'> }
  | { type: 'externe'; client: PortCopieWebDAV }

/** Copie un média préparé et ne rend sa référence qu'après preuve du contenu. */
export class CopieurMediasMigrationGitLab {
  constructor(
    private readonly source: Pick<TransfertGitLab, 'telechargerFichier'>,
    private readonly destination: DestinationCopieMediaMigration,
    private readonly dossierPreparation: string,
  ) {}

  async copier(
    media: MediaMigrationGitLab,
    surProgression?: SurProgressionFichier,
    signal?: AbortSignal,
  ): Promise<ReferenceMediaDistant> {
    verifierCheminMediaRelatif(media.cheminDestination)
    await this.copierContenu(media, surProgression, signal)
    return referenceMediaDistant(media.cheminDestination, this.destination.type === 'depot' ? 'gitlab' : 'webdav')
  }

  async conserver(fichier: FichierAutreMigration, surProgression?: SurProgressionFichier, signal?: AbortSignal): Promise<void> {
    if (!estDestinationAutreMigration(fichier.cheminDestination) || this.destination.type !== 'depot') throw new Error('Destination documentaire invalide.')
    await this.copierContenu(fichier, surProgression, signal)
  }

  private async copierContenu(media: FichierAutreMigration, surProgression?: SurProgressionFichier, signal?: AbortSignal): Promise<void> {
    verifierIdentiteContenuGitLab(media)
    signal?.throwIfAborted()
    mkdirSync(this.dossierPreparation, { recursive: true })
    const fichier = join(this.dossierPreparation, `media-${media.sha256}`)
    if (!existsSync(fichier)) {
      await this.source.telechargerFichier(media.cheminSource, fichier, surProgression)
    }
    await verifierFichier(fichier, media)
    signal?.throwIfAborted()
    if (this.destination.type === 'depot') {
      await this.destination.client.televerserObjet(fichier, media, surProgression, signal)
      return
    }
    await copierExterne(this.destination.client, media, fichier, this.dossierPreparation, surProgression)
  }
}

async function copierExterne(
  client: PortCopieWebDAV,
  media: FichierAutreMigration,
  fichier: string,
  dossierPreparation: string,
  surProgression?: SurProgressionFichier,
): Promise<void> {
  const segments = media.cheminDestination.split('/')
  for (let index = 1; index < segments.length; index += 1) {
    await client.mkcol(segments.slice(0, index).join('/'))
  }
  const dossier = segments.slice(0, -1).join('/')
  const nom = segments.at(-1)!
  const existe = (await client.propfind(dossier)).some((entree) => entree.chemin === nom)
  if (!existe) {
    try {
      await client.putFichier(media.cheminDestination, fichier, {
        ifNoneMatch: '*', contentType: 'application/octet-stream',
      }, surProgression)
    } catch (erreur) {
      if (!(erreur instanceof ErreurHttp) || erreur.statut !== 412) throw erreur
    }
  }
  const verification = join(dossierPreparation, `verification-${randomUUID()}`)
  try {
    await client.getBinaireFichier(media.cheminDestination, verification)
    await verifierFichier(verification, media)
  } finally {
    await unlink(verification).catch(() => undefined)
  }
}

async function verifierFichier(fichier: string, identite: IdentiteContenuGitLab): Promise<void> {
  const copie = await identifierFichierGitLab(fichier)
  if (copie.taille !== identite.taille || copie.sha256 !== identite.sha256) {
    throw new Error('Un fichier copié ne correspond pas à la source préparée. Aucun fichier existant ne sera remplacé.')
  }
}
