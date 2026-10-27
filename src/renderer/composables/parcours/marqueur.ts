import type { MarqueurDemo, ParcoursId, ProgressionParcoursDemo } from '../../../shared/format'

export interface ProgressionsDemo {
  progressions: Record<ParcoursId, Set<string>>
  contextes: Partial<Record<ParcoursId, Record<string, string>>>
  parcoursInitial: ParcoursId
  dernierParcoursId: ParcoursId | null
}

/** Relit les acquis et le contexte enregistrés dans le corpus. */
export function lireProgressionsDemo(marqueur: MarqueurDemo): ProgressionsDemo {
  const dernierParcoursId = marqueur.dernierParcoursId ?? marqueur.parcoursApprentissage ?? null
  return {
    progressions: {
      preparation: new Set(marqueur.parcours.preparation?.validees ?? []),
      traitement: new Set(marqueur.parcours.traitement?.validees ?? []),
      analyse: new Set(marqueur.parcours?.analyse?.validees ?? []),
      organisation: new Set(marqueur.parcours.organisation?.validees ?? []),
    },
    contextes: {
      ...(marqueur.parcours.organisation?.contexte
        ? { organisation: { ...marqueur.parcours.organisation.contexte } }
        : {}),
      ...(marqueur.parcours?.preparation?.contexte
        ? { preparation: { ...marqueur.parcours.preparation.contexte } }
        : {}),
      ...(marqueur.parcours?.traitement?.contexte
        ? { traitement: { ...marqueur.parcours.traitement.contexte } }
        : {}),
      ...(marqueur.parcours.analyse?.contexte
        ? { analyse: { ...marqueur.parcours.analyse.contexte } }
        : {}),
    },
    parcoursInitial: dernierParcoursId ?? 'preparation',
    dernierParcoursId,
  }
}

/** Enregistre séparément les acquis et le contexte de chaque parcours. */
export function serialiserProgressionsDemo(
  progressions: Record<ParcoursId, ReadonlySet<string>>,
  contextes: Partial<Record<ParcoursId, Record<string, string>>>,
): Partial<Record<ParcoursId, ProgressionParcoursDemo>> {
  return {
    organisation: {
      validees: [...progressions.organisation],
      ...(contextes.organisation ? { contexte: { ...contextes.organisation } } : {}),
    },
    preparation: {
      validees: [...progressions.preparation],
      ...(contextes.preparation ? { contexte: { ...contextes.preparation } } : {}),
    },
    traitement: {
      validees: [...progressions.traitement],
      ...(contextes.traitement ? { contexte: { ...contextes.traitement } } : {}),
    },
    analyse: {
      validees: [...progressions.analyse],
      ...(contextes.analyse ? { contexte: { ...contextes.analyse } } : {}),
    },
  }
}
