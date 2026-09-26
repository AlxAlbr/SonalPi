import type { EntreeVerrouPublic } from '../../shared/distant'

/** Observation publique de l'exclusion, séparée du tirage des contenus. */
export interface ObservationCoordinationDistante {
  /** N'échoue jamais : une panne est un résultat, pas une exception. */
  observerVerrous(): Promise<ResultatObservationVerrous>
}

/** Badges observés, et le fait de ne pas avoir pu les établir.
 *  Les deux cas se distinguent : aucun détenteur n'est une information,
 *  une observation en échec n'en est aucune. */
export interface ResultatObservationVerrous {
  entrees: EntreeVerrouPublic[]
  indisponible: boolean
}
