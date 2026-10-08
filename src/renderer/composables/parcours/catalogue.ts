import type { DefinitionParcours } from './types'

/** Le catalogue conserve un ordre pédagogique sans imposer de prérequis entre parcours. */
export function creerCatalogue(
  preparation: DefinitionParcours,
  traitement: DefinitionParcours,
): DefinitionParcours[] {
  return [preparation, traitement]
}

export const ANALYSE_A_VENIR = 'Analyse — à venir'
