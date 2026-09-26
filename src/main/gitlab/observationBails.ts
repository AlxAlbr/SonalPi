import type { EntreeVerrouPublic } from '../../shared/distant'
import type {
  ObservationCoordinationDistante,
  ResultatObservationVerrous,
} from '../distant/coordination'
import { normaliserRacineGitLab } from '../distant/coffre'
import {
  cheminBailRessourceGitLab,
  cleRessourceBailGitLab,
  observerBailGitLab,
  type BailObserveGitLab,
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
  /** Ressource historique d'un entretien, utilisée par les anciens marqueurs. */
  ressource: (id: string) => string
  /** Confirme qu'un bail observé est celui d'une session locale active. */
  bailTenuLocalement: (id: string, bail: BailObserveGitLab) => boolean
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

  async observerVerrous(): Promise<ResultatObservationVerrous> {
    const ids = this.options.idsEntretiens()
    if (ids.length === 0) return { entrees: [], indisponible: false }
    let badges: EntreeVerrouPublic[]
    try {
      badges = await this.relever(ids)
    } catch {
      // Une panne d'observation empêche les listes de décrire les exclusions.
      // Le tirage des contenus, lui, reste acquis.
      return { entrees: [], indisponible: true }
    }
    return { entrees: badges, indisponible: false }
  }

  private async relever(ids: string[]): Promise<EntreeVerrouPublic[]> {
    const lecteur = await this.options.instantane.racineDepot()
    const presents = await this.inventorier(lecteur)
    if (presents.size === 0) return []
    const out: EntreeVerrouPublic[] = []
    for (const id of ids) {
      for (const candidat of this.cheminsDuBail(id)) {
        if (!presents.has(candidat.chemin)) continue
        const bail = await this.lireBail(lecteur, candidat.chemin, candidat.legacy)
        if (!bail) continue
        // Le coordinateur refuse d'abord tout marqueur historique. Un bail v2,
        // lui, ne bloque plus après son expiration.
        if (!bail.legacy && Date.parse(bail.expireLe) <= this.maintenant()) continue
        if (this.options.bailTenuLocalement(id, bail)) break
        out.push({
          chemin: `entretiens/${id}.json`,
          etag: null,
          contenu: { userId: bail.userId, machineId: bail.machineId, acquiredAt: '' },
        })
        break
      }
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

  /** Marqueur historique puis bail courant, dans l'ordre de refus du coordinateur. */
  private cheminsDuBail(id: string): Array<{ chemin: string; legacy: boolean }> {
    return [
      { chemin: cheminBailRessourceGitLab(this.options.ressource(id)), legacy: true },
      {
        chemin: cheminBailRessourceGitLab(
          cleRessourceBailGitLab(this.options.branche, this.cheminEntretien(id)),
        ),
        legacy: false,
      },
    ]
  }

  private cheminEntretien(id: string): string {
    const chemin = `entretiens/${id}.json`
    return this.racine ? `${this.racine}/${chemin}` : chemin
  }

  /** Un contenu illisible est omis.
   *  Une panne de transport rend l'observation indisponible.
   *  L'absence de badge ne serait sinon plus fiable. */
  private async lireBail(
    lecteur: LecteurGitLab,
    chemin: string,
    legacy: boolean,
  ): Promise<BailObserveGitLab | null> {
    const contenu = await lecteur.lireTexte(chemin)
    try {
      return observerBailGitLab(contenu, chemin, legacy)
    } catch {
      return null
    }
  }
}
