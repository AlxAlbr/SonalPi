import type { ProgressionTransfert } from '../../shared/distant'
import { ClientWebDAV } from '../webdav/client'
import { LecteurWebDAV } from './lecteurWebDAV'
import {
  MiroirDistant,
  type IdentiteMiroirDistant,
} from './miroir'
import type { LectureDistante } from './lecture'
import type { TransfertFichiersDistants } from './transfert'
import { TransfertWebDAV } from './transfertWebDAV'

/** Assemble le miroir commun avec les ports de lecture et de transfert WebDAV. */
export class MiroirWebDAV extends MiroirDistant {
  constructor(
    private readonly client: ClientWebDAV,
    dirLocal: string,
    surProgression?: (progression: ProgressionTransfert) => void,
    lecture: LectureDistante = new LecteurWebDAV(client),
    identite: IdentiteMiroirDistant = {
      fournisseur: 'webdav',
      destinationId: `${client.config.baseUrl}#${client.config.identifiants.utilisateur}`,
    },
    transfert: TransfertFichiersDistants = new TransfertWebDAV(client),
  ) {
    super(dirLocal, async () => lecture, identite, transfert, surProgression)
  }

  /** Donne accès au client aux services Nextcloud qui ne passent pas encore par un port. */
  accesClient(): ClientWebDAV {
    return this.client
  }

  /** Retourne l'ETag WebDAV observé, utilisable comme garde d'écriture. */
  etagDistant(cheminRelatif: string): string | null {
    const empreinte = this.empreinteDistante(cheminRelatif)
    return empreinte?.type === 'webdav-etag' ? empreinte.valeur : null
  }

  /** Enregistre l'ETag confirmé après une publication WebDAV. */
  noterEtagPublie(cheminRelatif: string, etag: string): void {
    this.noterEmpreintePubliee(cheminRelatif, {
      type: 'webdav-etag',
      valeur: etag,
    })
  }
}
