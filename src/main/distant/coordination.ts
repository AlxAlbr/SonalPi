import type { EntreeVerrouPublic } from '../../shared/distant'

/** Observation publique de l'exclusion, séparée du tirage des contenus. */
export interface ObservationCoordinationDistante {
  observerVerrous(): Promise<EntreeVerrouPublic[]>
}
