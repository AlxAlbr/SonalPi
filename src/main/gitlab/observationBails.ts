import type { EntreeVerrouPublic } from '../../shared/distant'
import type { ObservationCoordinationDistante } from '../distant/coordination'
import { normaliserRacineGitLab } from '../distant/coffre'
import {
  cheminBailRessourceGitLab,
  cleRessourceBailGitLab,
  observerBailGitLab,
} from './bailGitLab'
import { ErreurGitLab } from './client'
import type { InstantaneLectureGitLab, LecteurGitLab } from './lecture'

const DOSSIER_BAILS = '.sonal/verrous'

export interface OptionsObservationBailsGitLab {
  instantane: InstantaneLectureGitLab
  branche: string
  racine?: string
  /** Identifiants des entretiens du corpus local : seuls leurs bails sont lus,
   *  les autres fichiers du dossier de coordination restent ignorés. */
  idsEntretiens: () => string[]
  /** Ressource de bail d'un entretien, calculée par les sessions. */
  ressource: (id: string) => string
  /** Ressources dont ce poste détient effectivement la session. */
  ressourcesTenues: () => string[]
  maintenant?: () => number
}

/** Observe les bails GitLab sans les intégrer à l'inventaire du miroir.
 *  Le dossier de coordination est à la racine du dépôt, hors du corpus.
 *  L'observation ne décide rien : elle indique qui tient un entretien, et
 *  l'exclusion reste vérifiée à l'ouverture, par le bail lui-même. */
export class ObservationBailsGitLab implements ObservationCoordinationDistante {
  private readonly racine: string
  private readonly maintenant: () => number

  constructor(private readonly options: OptionsObservationBailsGitLab) {
    this.racine = normaliserRacineGitLab(options.racine ?? '')
    this.maintenant = options.maintenant ?? Date.now
  }

  async observerVerrous(): Promise<EntreeVerrouPublic[]> {
    const ids = this.options.idsEntretiens()
    if (ids.length === 0) return []
    const lecteur = await this.options.instantane.racineDepot()
    const presents = await this.inventorier(lecteur)
    if (presents.size === 0) return []
    const tenues = new Set(this.options.ressourcesTenues())
    const out: EntreeVerrouPublic[] = []
    for (const id of ids) {
      const chemin = this.cheminDuBail(id, presents)
      if (!chemin) continue
      if (tenues.has(this.options.ressource(id))) continue
      const bail = await this.lireBail(lecteur, chemin)
      // Un bail expiré ne vaut plus exclusion ; un ancien marqueur en vaut
      // toujours une, le coordinateur le refusant sans regarder l'échéance.
      if (!bail || (!bail.legacy && Date.parse(bail.expireLe) <= this.maintenant())) continue
      out.push({
        chemin: `entretiens/${id}.json`,
        etag: null,
        contenu: { userId: bail.userId, machineId: bail.machineId, acquiredAt: '' },
      })
    }
    return out
  }

  /** Fichiers de bails présents au commit observé. Un dépôt sans baux n'a pas
   *  le dossier : ce n'est pas une panne, l'inventaire est simplement vide. */
  private async inventorier(lecteur: LecteurGitLab): Promise<Set<string>> {
    try {
      const entrees = await lecteur.inventorier(DOSSIER_BAILS)
      return new Set(
        entrees
          .filter((entree) => !entree.dossier)
          .map((entree) => `${DOSSIER_BAILS}/${entree.chemin}`),
      )
    } catch (erreur) {
      if (erreur instanceof ErreurGitLab && erreur.statut === 404) return new Set()
      throw erreur
    }
  }

  /** Fichier de bail de l'entretien : le versionné s'il existe, sinon
   *  l'ancien marqueur écrit sous la seule ressource. */
  private cheminDuBail(id: string, presents: Set<string>): string | null {
    const courant = cheminBailRessourceGitLab(
      cleRessourceBailGitLab(this.options.branche, this.cheminEntretien(id)),
    )
    if (presents.has(courant)) return courant
    const ancien = cheminBailRessourceGitLab(this.options.ressource(id))
    return presents.has(ancien) ? ancien : null
  }

  private cheminEntretien(id: string): string {
    const chemin = `entretiens/${id}.json`
    return this.racine ? `${this.racine}/${chemin}` : chemin
  }

  /** Un bail illisible est omis : le badge ne se devine pas. */
  private async lireBail(
    lecteur: LecteurGitLab,
    chemin: string,
  ): Promise<ReturnType<typeof observerBailGitLab> | null> {
    try {
      return observerBailGitLab(await lecteur.lireTexte(chemin), chemin)
    } catch {
      return null
    }
  }
}
