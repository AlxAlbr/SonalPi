import type { ClientWebDAV } from '../webdav/client'
import type {
  EntreeLectureDistante,
  LectureDistante,
} from './lecture'

/** Adapte les lectures WebDAV au contrat consommé par le miroir. */
export class LecteurWebDAV implements LectureDistante {
  constructor(private readonly client: ClientWebDAV) {}

  async inventorier(dossierRelatif: string): Promise<EntreeLectureDistante[]> {
    return (await this.client.propfind(dossierRelatif)).map((entree) => ({
      chemin: entree.chemin,
      dossier: entree.dossier,
      empreinte: entree.etag
        ? { type: 'webdav-etag', valeur: entree.etag }
        : null,
      taille: entree.taille,
    }))
  }

  lireTexte(cheminRelatif: string): Promise<string> {
    return this.client.getTexte(cheminRelatif)
  }
}
