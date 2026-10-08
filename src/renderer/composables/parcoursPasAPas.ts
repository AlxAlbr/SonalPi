export interface EtapeParcoursAffichable {
  id: string
  requiere?: string
}

export interface EtatPresentationParcours<T extends EtapeParcoursAffichable> {
  nombreRealisees: number
  termine: boolean
  prochaine: T | null
}

/** Dérive la progression et la première étape disponible depuis l'état partagé. */
export function etatPresentationParcours<T extends EtapeParcoursAffichable>(
  etapes: readonly T[],
  validees: ReadonlySet<string>,
): EtatPresentationParcours<T> {
  const nombreRealisees = etapes.reduce(
    (total, etape) => total + (validees.has(etape.id) ? 1 : 0),
    0,
  )
  const prochaine = etapes.find(
    (etape) =>
      !validees.has(etape.id) &&
      (!etape.requiere || validees.has(etape.requiere)),
  ) ?? null
  return {
    nombreRealisees,
    termine: etapes.length > 0 && nombreRealisees === etapes.length,
    prochaine,
  }
}
