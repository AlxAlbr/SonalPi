import type { ParcoursId } from '../../../shared/format'
import type { DefinitionParcours, EtapeActive } from './types'

export interface EtatPresentationParcours<T extends { id: string; requiere?: string }> {
  nombreRealisees: number
  termine: boolean
  prochaine: T | null
}

/** Dérive la progression et la première étape accessible d'un parcours. */
export function etatPresentationParcours<T extends { id: string; requiere?: string }>(
  etapes: readonly T[],
  validees: ReadonlySet<string>,
): EtatPresentationParcours<T> {
  const nombreRealisees = etapes.reduce(
    (total, etape) => total + (validees.has(etape.id) ? 1 : 0),
    0,
  )
  const prochaine = etapes.find(
    (etape) => !validees.has(etape.id) && (!etape.requiere || validees.has(etape.requiere)),
  ) ?? null
  return {
    nombreRealisees,
    termine: etapes.length > 0 && nombreRealisees === etapes.length,
    prochaine,
  }
}

export interface EtatCatalogueParcours {
  id: ParcoursId
  titre: string
  resume: string
  disponible: boolean
  indisponibilite: string | null
  nombreRealisees: number
  total: number
  termine: boolean
  prochaineId: string | null
}

/** Produit les états d'affichage sans modifier les définitions ni les acquis. */
export function etatsCatalogue(
  definitions: readonly DefinitionParcours[],
  progressions: Partial<Record<ParcoursId, ReadonlySet<string>>>,
): EtatCatalogueParcours[] {
  return definitions.map((definition) => {
    const presentation = etatPresentationParcours(
      definition.etapes,
      progressions[definition.id] ?? new Set<string>(),
    )
    const disponible = definition.disponible()
    return {
      id: definition.id,
      titre: definition.titre,
      resume: definition.resume,
      disponible,
      indisponibilite: disponible ? null : (definition.indisponibilite?.() ?? 'À venir.'),
      nombreRealisees: presentation.nombreRealisees,
      total: definition.etapes.length,
      termine: presentation.termine,
      prochaineId: presentation.prochaine?.id ?? null,
    }
  })
}

/** Un parcours terminé ne termine pas les autres ; le suivant disponible est recommandé. */
export function recommanderParcoursSuivant(
  definitions: readonly DefinitionParcours[],
  courant: ParcoursId,
  progressions: Partial<Record<ParcoursId, ReadonlySet<string>>>,
): ParcoursId | null {
  const index = definitions.findIndex((definition) => definition.id === courant)
  return definitions.slice(index + 1).find((definition) => {
    if (!definition.disponible()) return false
    const etat = etatPresentationParcours(
      definition.etapes,
      progressions[definition.id] ?? new Set<string>(),
    )
    return !etat.termine
  })?.id ?? null
}

export function memeEtape(a: EtapeActive, b: EtapeActive): boolean {
  return a?.parcoursId === b?.parcoursId && a?.etapeId === b?.etapeId
}
