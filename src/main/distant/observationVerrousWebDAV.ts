import type { ClientWebDAV } from '../webdav/client'
import { ErreurHttp } from '../webdav/client'
import type {
  ObservationCoordinationDistante,
  ResultatObservationVerrous,
} from './coordination'
import type { SessionsDEntretien } from './sessions'

/** Observe les verrous Nextcloud sans les intégrer à l'inventaire du miroir. */
export class ObservationVerrousWebDAV implements ObservationCoordinationDistante {
  constructor(
    private readonly client: ClientWebDAV,
    private readonly sessions: SessionsDEntretien,
    private readonly verrouNatif: boolean,
  ) {}

  async observerVerrous(): Promise<ResultatObservationVerrous> {
    if (this.verrouNatif) return this.sessions.etatVerrousPublicsNatifs()
    try {
      const entrees = await this.client.propfind('verrous')
      return {
        entrees: await this.sessions.etatVerrousPublics(
          entrees
            .filter((entree) => !entree.dossier && entree.chemin.endsWith('.lock.json'))
            .map((entree) => ({
              chemin: `verrous/${entree.chemin}`,
              etag: entree.etag,
            })),
        ),
        indisponible: false,
      }
    } catch (erreur) {
      // Un dossier absent signifie « aucun verrou coopératif » ; toute autre
      // panne ne retire rien au tirage des contenus, mais les badges, eux,
      // ne disent plus rien sur les exclusions.
      if (erreur instanceof ErreurHttp && erreur.statut === 404) {
        return { entrees: [], indisponible: false }
      }
      return { entrees: [], indisponible: true }
    }
  }
}
