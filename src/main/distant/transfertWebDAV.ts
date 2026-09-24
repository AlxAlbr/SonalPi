import type { ClientWebDAV } from '../webdav/client'
import type {
  ResultatTeleversement,
  SurProgressionFichier,
  TransfertFichiersDistants,
} from './transfert'

/** Adapte les transferts binaires WebDAV au contrat du miroir. */
export class TransfertWebDAV implements TransfertFichiersDistants {
  constructor(private readonly client: ClientWebDAV) {}

  telechargerFichier(
    cheminRelatif: string,
    destination: string,
    surProgression?: SurProgressionFichier,
  ): Promise<void> {
    return this.client.getBinaireFichier(cheminRelatif, destination, surProgression)
  }

  async televerserFichier(
    cheminCible: string,
    contenu: Uint8Array | string,
    contentType?: string,
    surProgression?: SurProgressionFichier,
  ): Promise<ResultatTeleversement> {
    if (!this.cheminSain(cheminCible)) return { ok: false, raison: 'chemin-invalide' }

    const segments = cheminCible.split('/')
    for (let i = 1; i < segments.length; i++) {
      await this.client.mkcol(segments.slice(0, i).join('/'))
    }
    const indexNom = segments.length - 1
    const dossier = indexNom === 0 ? '' : segments.slice(0, indexNom).join('/')
    const nom = segments[indexNom]
    const existants = new Set(
      (await this.client.propfind(dossier))
        .filter((entree) => !entree.dossier)
        .map((entree) => entree.chemin),
    )
    if (existants.has(nom)) {
      const point = nom.lastIndexOf('.')
      const base = point === -1 ? nom : nom.slice(0, point)
      const extension = point === -1 ? '' : nom.slice(point)
      let suffixe = 2
      while (existants.has(`${base}-${suffixe}${extension}`) && suffixe < 100) suffixe += 1
      const suggestion = `${base}-${suffixe}${extension}`
      return {
        ok: false,
        raison: 'existe',
        suggere: dossier ? `${dossier}/${suggestion}` : suggestion,
      }
    }

    const cible = dossier ? `${dossier}/${nom}` : nom
    if (typeof contenu === 'string') {
      await this.client.putFichier(cible, contenu, { contentType }, surProgression)
    } else {
      await this.client.putBinaire(cible, contenu, { contentType })
    }
    return { ok: true }
  }

  private cheminSain(chemin: string): boolean {
    if (!chemin || chemin.startsWith('/') || chemin.includes('\\')) return false
    if (chemin.endsWith('.json')) return false
    return !chemin.split('/').some((segment) =>
      segment === '' || segment === '.' || segment === '..' || segment.includes(':') || segment.includes('\0'),
    )
  }
}
