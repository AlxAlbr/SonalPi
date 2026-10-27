import type { DefinitionParcours } from './types'

/** Le catalogue conserve un ordre pédagogique sans imposer de prérequis entre parcours. */
export function creerCatalogue(
  preparation: DefinitionParcours,
  traitement: DefinitionParcours,
  analyse: DefinitionParcours,
  organisation: DefinitionParcours,
): DefinitionParcours[] {
  return [preparation, traitement, analyse, organisation]
}
