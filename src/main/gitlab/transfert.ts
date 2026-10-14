import { createHash, randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { link, unlink } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { SurProgressionFichier, TransfertFichiersDistants } from '../distant/transfert'
import type { ClientGitLab } from './client'
import { LectureV1GitLab } from './lectureV1'

export interface IdentiteContenuGitLab {
  taille: number
  sha256: string
}

export function verifierIdentiteContenuGitLab(identite: IdentiteContenuGitLab): void {
  if (!Number.isSafeInteger(identite.taille) || identite.taille < 0 || !/^[a-f0-9]{64}$/.test(identite.sha256)) {
    throw new Error('Identité du fichier binaire invalide.')
  }
}

/** Compte et vérifie les octets sans conserver le fichier en mémoire. */
export function fluxVerificationGitLab(
  identite: IdentiteContenuGitLab,
  surProgression?: SurProgressionFichier,
): Transform {
  verifierIdentiteContenuGitLab(identite)
  const hash = createHash('sha256')
  let octets = 0
  return new Transform({
    transform(morceau: Buffer, _encodage, terminer) {
      octets += morceau.byteLength
      if (octets > identite.taille) {
        terminer(new Error('Le transfert binaire dépasse la taille annoncée.'))
        return
      }
      hash.update(morceau)
      surProgression?.(octets, identite.taille)
      terminer(null, morceau)
    },
    flush(terminer) {
      if (octets !== identite.taille || hash.digest('hex') !== identite.sha256) {
        terminer(new Error('Le contenu binaire ne correspond pas à la source annoncée.'))
      } else terminer()
    },
  })
}

/** Une copie n'apparaît qu'après vérification complète, sans remplacer l'existant. */
export async function installerFluxGitLab(
  reponse: Response,
  destination: string,
  identite: IdentiteContenuGitLab,
  surProgression?: SurProgressionFichier,
): Promise<void> {
  const temporaire = `${destination}.${randomUUID()}.tmp`
  try {
    if (!reponse.body) throw new Error('Le transfert GitLab ne fournit aucun contenu.')
    await pipeline(
      Readable.fromWeb(reponse.body as unknown as import('node:stream/web').ReadableStream),
      fluxVerificationGitLab(identite, surProgression),
      createWriteStream(temporaire, { flags: 'wx' }),
    )
    await link(temporaire, destination)
  } finally {
    await reponse.body?.cancel().catch(() => undefined)
    await unlink(temporaire).catch(() => undefined)
  }
}

/** Transporte les médias du dépôt au commit utilisé pour tirer les documents. */
export class TransfertGitLab implements TransfertFichiersDistants {
  constructor(
    private readonly client: ClientGitLab,
    private readonly commit: () => Promise<string>,
    private readonly racine = '',
  ) {}

  async telechargerFichier(
    cheminRelatif: string,
    destination: string,
    surProgression?: SurProgressionFichier,
  ): Promise<void> {
    const chemin = [this.racine, cheminRelatif].filter(Boolean).join('/')
    const commit = await this.commit()
    const lecture = new LectureV1GitLab(this.client, commit)
    const information = await lecture.information(chemin)
    const reponse = await this.client.lireFlux(
      this.client.cheminProjet(`/repository/files/${encodeURIComponent(chemin)}/raw`),
      { ref: commit, lfs: information.stockage === 'lfs' ? 'true' : 'false' },
    )
    await installerFluxGitLab(reponse, destination, information, surProgression)
  }

  async televerserFichier() {
    return { ok: false, raison: 'publication-requise' }
  }
}
